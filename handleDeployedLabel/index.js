const crypto = require('crypto');
const got = require('got');
const url = require('url');

const settings = require('./settings.json');

/**
 * Assigns the Project Management team to the Pull Request when it gets the "Deployed" labels.
 * Slacks the Project Management team.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleDeployedLabel = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "labeled" action
  if (req.body.action !== 'labeled') {
    res.end();
    return;
  }

  // We only care about the "Needs" labels
  const statuses = ['Deployed: Staging', 'Deployed: Demo'];
  const label = req.body.label.name;
  if (!statuses.includes(label)) {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  return (
    // Validate the request
    validateRequest(req)
      // Assign owner
      .then(() => assign(pullRequest))
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

function assign(pullRequest) {
  const tasks = settings.assignees.map(assignee => {
    console.log(`Assigning ${assignee} to the Pull Request`);

    return makeRequest(`${pullRequest.issue_url}/assignees`, {
      method: 'POST',
      body: {
        assignees: [assignee]
      }
    });
  });

  return Promise.all(tasks);
}
