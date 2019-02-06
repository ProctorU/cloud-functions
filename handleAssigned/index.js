const crypto = require('crypto');
const slack = require('slack');

const settings = require('./settings.json');

/**
 * Assigns a reviewer to a new pull request from a list of eligble reviewers.
 * Reviewers with the least assigned reviews on open pull requests will be
 * prioritized for assignment.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleAssigned = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "assigned" action
  if (req.body.action !== 'assigned') {
    res.end();
    return;
  }

  const assignees = settings.assignees;
  const assignee = req.body.assignee.login;
  const pullRequest = req.body.pull_request;

  // We only care about specific assignees
  if (!assignees.map(a => a.github).includes(assignee)) {
    res.end();
    return;
  }

  // Don't slack if Ready to Ship
  if (
    pullRequest.labels.find(label => label.name === 'Status: Ready To Ship')
  ) {
    res.end();
    return;
  }

  console.log(`New Assignee: ${assignee}`);

  // Validate the request
  return (
    validateRequest(req)
      // Figure out who should receive the Slack message
      .then(() => sendSlackMessage(assignee, pullRequest))
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

function sendSlackMessage(assignee, pullRequest) {
  const user = settings.assignees.find(a => a.github === assignee);
  console.log(`Sending message to ${user.slack}`);

  return slack.chat.postMessage({
    token: settings.slackToken,
    channel: `@${user.slack}`,
    text: slackMessageContext(pullRequest),
    username: 'storm',
    icon_url: 'https://s3-us-west-2.amazonaws.com/storm-app/icon.png?v=2'
  });
}

function slackMessageContext(pullRequest) {
  let message;
  const labels = pullRequest.labels.map(label => label.name);

  if (labels.includes('Deployed: Demo')) {
    message = `We've deployed the following Pull Request to 'Demo': ${
      pullRequest.html_url
      }`;
  } else if (labels.includes('Deployed: Staging')) {
    message = `We've deployed the following Pull Request to 'Staging': ${
      pullRequest.html_url
      }`;
  } else if (labels.includes('Status: Ready To Ship')) {
    message = `The following Pull Request is ready to ship: ${
      pullRequest.html_url
      }`;
  } else if (labels.includes('Status: Review Complete')) {
    message = `The following Pull Request is review complete: ${
      pullRequest.html_url
      }`;
  } else if (labels.includes('Status: Revised')) {
    message = `The following Pull Request has been revised: ${
      pullRequest.html_url
      }`;
  } else {
    message = `You've been assigned to the following Pull Request: ${
      pullRequest.html_url
      }`;
  }

  return message;
}
