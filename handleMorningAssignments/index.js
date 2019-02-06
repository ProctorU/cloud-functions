const got = require('got');
const url = require('url');
const slack = require('slack');

const settings = require('./settings.json');

const ASSIGNEES = settings.reviewers.reduce((object, reviewer) => {
  if (reviewer.github) {
    object[`${reviewer.github}:${reviewer.slack}`] = [];
  }
  return object;
}, {});

exports.handleMorningAssignments = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  const date = new Date();
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) {
    res.end();
    return;
  }

  return getOpenPullRequests()
    .then(filterForReviews)
    .then(buildAssignments)
    .then(sendSlackMessage)
    .then(() => {
      res.status(200).end();
    })
    .catch(err => {
      console.error(err.stack);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send(err.message)
        .end();
    });
};

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
  return got(parts, options).then(res => res.body);
}

function getOpenPullRequests() {
  return makeRequest('https://api.github.com/repos/ProctorU/archimedes/pulls', {
    query: {
      per_page: 100
    }
  });
}

function filterForReviews(pullRequests) {
  return Promise.resolve(pullRequests.filter(needsReview));
}

function needsReview(pullRequest) {
  const isReady = pullRequest.labels.filter(
    label =>
      label.name === 'Status: Review Complete' ||
      label.name === 'Status: Ready To Ship' ||
      label.name === 'Status: Blocked' ||
      label.name === 'Needs: Revision'
  );

  return isReady.length < 1;
}

function buildAssignments(pullRequests) {
  pullRequests.map(pullRequest => {
    if (needsReview(pullRequest)) {
      pullRequest.assignees.forEach(assignee => {
        const matchedKey = Object.keys(ASSIGNEES).find(a =>
          a.match(assignee.login)
        );

        if (ASSIGNEES[matchedKey]) {
          ASSIGNEES[matchedKey].push(pullRequest.html_url);
        }
      });
    }
  });

  return Promise.resolve(ASSIGNEES);
}

function sendSlackMessage(assignees) {
  let tasks = [];

  for (assignee in assignees) {
    if (assignees.hasOwnProperty(assignee)) {
      const slackUsername = assignee.split(':')[1];
      const pullRequests = assignees[assignee];
      const task = slack.chat.postMessage({
        token: settings.slackToken,
        channel: '#reviews',
        text: `<@${slackUsername}>: ${pullRequests.length}\n${pullRequests.join(
          '\n'
        )}\n`,
        username: 'storm',
        icon_url: 'https://s3-us-west-2.amazonaws.com/storm-app/icon.png?v=2'
      });

      tasks.concat(task);
    }
  }

  return Promise.all(tasks);
}
