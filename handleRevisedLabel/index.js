const crypto = require('crypto');
const got = require('got');
const url = require('url');

const settings = require('./settings.json');

/**
 * Assigns the owner to the Pull Request when it gets a "Needs" label.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleRevisedLabel = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "labeled" action
  if (req.body.action !== 'labeled') {
    res.end();
    return;
  }

  // We only care about the "Needs" labels
  const statuses = ['Status: Revised'];
  if (!statuses.includes(req.body.label.name)) {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  return (
    // Validate the request
    validateRequest(req)
      // Assign reviewers
      .then(() => assignReviewers(pullRequest))
      // Remove "Needs" labels
      .then(() => removeLabels(pullRequest))
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
  console.log('Making request to: ', uri);
  return got(parts, options).then(res => res.body);
}

function assignReviewers(pullRequest) {
  console.log('Fetching previous reviewers');

  return makeRequest(`${pullRequest.url}/reviews`).then(reviewers => {
    const tasks = reviewers.map(reviewer =>
      assignReviewer(pullRequest, reviewer)
    );

    return Promise.all(tasks);
  });
}

function assignReviewer(pullRequest, reviewer) {
  if (reviewer.user.login === 'codeclimate[bot]') {
    return;
  }

  console.log('Assigning the reviewer: ', reviewer.user.login);

  return makeRequest(`${pullRequest.issue_url}/assignees`, {
    method: 'POST',
    body: {
      assignees: [reviewer.user.login]
    }
  });
}

function removeLabels(pullRequest) {
  const labels = pullRequest.labels.filter(label =>
    label.name.includes('Needs:')
  );

  if (labels.length > 0) {
    const tasks = labels.map(label => removeLabel(pullRequest, label));
    return Promise.all(tasks);
  } else {
    console.log('No need to remove any labels.');
    return Promise.resolve();
  }
}

function removeLabel(pullRequest, label) {
  console.log('Removing the following label: ', label.name);
  return makeRequest(`${pullRequest.issue_url}/labels/${label.name}`, {
    method: 'DELETE'
  });
}
