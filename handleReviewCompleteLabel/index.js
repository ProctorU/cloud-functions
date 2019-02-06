const crypto = require('crypto');
const got = require('got');
const url = require('url');

const settings = require('./settings.json');

/**
 * Assigns the owner to the Pull Request once it's fully reviewed.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleReviewCompleteLabel = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "labeled" action
  if (req.body.action !== 'labeled') {
    res.end();
    return;
  }

  // We only care about the label, "Status: Ready to Ship"
  if (req.body.label.name !== 'Status: Review Complete') {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  return (
    // Validate the request
    validateRequest(req)
      // Remove "Status: Reviewed" label && "Status: Revised"
      .then(() => removeLabels(pullRequest))
      // Remove current assignees
      .then(() => removeCurrentAssignees(pullRequest))
      // Assign owner
      .then(() => assignOwner(pullRequest))
      .then(() => {
        res.status(200).end();
      })
      .catch(err => {
        console.error(err.stack);
        res
          .status(err.statusCode ? err.statusCode : 500)
          .send(err.message)
          .end();
      })
  );
};

function validateRequest(req) {
  return Promise.resolve().then(() => {
    const digest = crypto
      .createHmac('sha1', settings.secretToken)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (req.headers['x-hub-signature'] !== `sha1=${digest}`) {
      const error = new Error('Unauthorized');
      error.statusCode = 403;
      throw error;
    } else {
      console.log('Request validated.');
    }
  });
}

function makeRequest(uri, options) {
  options || (options = {});

  // Add appropriate headers
  options.headers || (options.headers = {});
  options.headers.Accept =
    'application/vnd.github.black-cat-preview+json,application/vnd.github.v3+json';

  // Send and accept JSON
  options.json = true;
  if (options.body) {
    options.headers['Content-Type'] = 'application/json';
  }

  // Add authentication
  const parts = url.parse(uri);
  parts.auth = `proctoru-bot:${settings.accessToken}`;

  // Make the request
  console.log('Making the request: ', uri);
  return got(parts, options).then(res => res.body);
}

function removeLabels(pullRequest) {
  let removeReviewedLabel, removeRevisedLabel;
  const hasReviewedLabel = pullRequest.labels.find(
    label => label.name === 'Status: Reviewed'
  );
  const hasRevisedLabel = pullRequest.labels.find(
    label => label.name === 'Status: Revised'
  );

  if (hasReviewedLabel) {
    console.log('Removing label: Status Reviewed');
    removeReviewedLabel = makeRequest(
      `${pullRequest.issue_url}/labels/Status: Reviewed`,
      {
        method: 'DELETE'
      }
    );
  } else {
    removeReviewedLabel = Promise.resolve();
  }

  if (hasRevisedLabel) {
    console.log('Removing label: Status Revised');
    removeRevisedLabel = makeRequest(
      `${pullRequest.issue_url}/labels/Status: Revised`,
      {
        method: 'DELETE'
      }
    );
  } else {
    removeRevisedLabel = Promise.resolve();
  }

  const labels = pullRequest.labels.filter(
    label =>
      label.name === 'Status: Reviewed' || label.name === 'Status: Revised'
  );

  if (labels.size > 0) {
    const tasks = labels.map(label => {
      console.log(`Removing labels: ${label.name}`);

      return makeRequest(`${pullRequest.issue_url}/labels/${label.name}`, {
        method: 'DELETE'
      });
    });

    return Promise.all(tasks);
  } else {
    console.log('Skipping label removal');
    return Promise.resolve();
  }
}

function removeCurrentAssignees(pullRequest) {
  const assignees = pullRequest.assignees.map(assignee => assignee.login);
  console.log('Removing assignees: ', JSON.stringify(assignees, null, 2));

  return makeRequest(`${pullRequest.issue_url}/assignees`, {
    method: 'DELETE',
    body: {
      assignees: assignees
    }
  });
}

function assignOwner(pullRequest) {
  console.log('Assigning the owner: ', pullRequest.user.login);

  return makeRequest(`${pullRequest.issue_url}/assignees`, {
    method: 'POST',
    body: {
      assignees: [pullRequest.user.login]
    }
  });
}
