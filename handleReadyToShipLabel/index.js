const crypto = require('crypto');
const got = require('got');
const url = require('url');

const settings = require('./settings.json');

/**
 * Assigns the deployers to the Pull Request when it is ready to ship.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleReadyToShipLabel = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "labeled" action
  if (req.body.action !== 'labeled') {
    res.end();
    return;
  }

  // We only care about the label, "Status: Ready to Ship"
  if (req.body.label.name !== 'Status: Ready To Ship') {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;
  const sender = req.body.sender;

  return (
    // Validate the request
    validateRequest(req)
      // Remove current assignees
      .then(() => removeCurrentAssignees(pullRequest))
      .then(() => removeReviewCompleteLabel(pullRequest))
      .then(() => assignAuthor(pullRequest))
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
    // if (typeof options.body === 'object') {
    //   options.body = options.body);
    // }
  }

  // Add authentication
  const parts = url.parse(uri);
  parts.auth = `proctoru-bot:${settings.accessToken}`;

  // Make the request
  console.log('Making a request to: ', uri);
  return got(parts, options).then(res => res.body);
}

function removeCurrentAssignees(pullRequest) {
  const assignees = pullRequest.assignees.map(assignee => assignee.login);

  return makeRequest(`${pullRequest.issue_url}/assignees`, {
    method: 'DELETE',
    body: {
      assignees: assignees
    }
  });
}

function removeReviewCompleteLabel(pullRequest) {
  const label = pullRequest.labels.find(
    label => label.name === 'Status: Review Complete'
  );

  if (label) {
    console.log('Removing `Status: Review Complete` label');
    return makeRequest(
      `${pullRequest.issue_url}/labels/Status: Review Complete`,
      {
        method: 'DELETE'
      }
    );
  } else {
    console.log('Skipping label removal');
    return Promise.resolve();
  }
}

function assignAuthor(pullRequest) {
  console.log('Assigning the PR author.');
  return makeRequest(`${pullRequest.issue_url}/assignees`, {
    method: 'POST',
    body: {
      assignees: [pullRequest.user.login]
    }
  });
}
