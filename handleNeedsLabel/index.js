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
exports.handleNeedsLabel = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "labeled" action
  if (req.body.action !== 'labeled') {
    res.end();
    return;
  }

  // We only care about the "Needs" labels
  const statuses = ['Needs: Follow Up', 'Needs: Revision', 'Needs: Tests'];
  if (!statuses.includes(req.body.label.name)) {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  return (
    // Validate the request
    validateRequest(req)
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
  return got(parts, options).then(res => res.body);
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
