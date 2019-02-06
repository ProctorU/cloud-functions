const crypto = require('crypto');
const Datastore = require('@google-cloud/datastore');
const slack = require('slack');

const settings = require('./settings.json');
const projectId = settings.projectId;

// Creates a client for Google Cloud Datastore
const datastore = new Datastore({
  projectId: projectId
});

/**
 * Send a Slack message to every developer that hasn't reviewed 2 PRs today.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleDailyReview = (req, res) => {
  console.log('Receiving request to handle daily reviews');

  // Don't send Slack messages on a weekend.
  const date = new Date();
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) {
    res.end();
    return;
  }

  return getReviewers(date)
    .then(reviewers => sendSlackMessages(reviewers))
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

function getReviewers(today) {
  today.setHours(0, 0, 0, 0);

  const tasks = settings.reviewers.map(reviewer => {
    const query = datastore
      .createQuery('GithubReview')
      .filter('user', '=', reviewer.github)
      .filter('submittedAt', '>', today);

    return datastore.runQuery(query).then(response => {
      return { username: reviewer.slack, reviewCount: response[0].length };
    });
  });

  return Promise.all(tasks);
}

function sendSlackMessages(reviewers) {
  const tasks = reviewers.map(reviewer => {
    if (reviewer.reviewCount < 2) {
      console.log(`Sending message to ${reviewer.username}`);

      return slack.chat.postMessage({
        token: settings.slackToken,
        channel: `@${reviewer.username}`,
        text: `Friendly reminder to get your reviews in: ${
          reviewer.reviewCount
        }/2 so far.`,
        username: 'storm',
        icon_url: 'https://s3-us-west-2.amazonaws.com/storm-app/icon.png?v=2'
      });
    } else {
      console.log(`${reviewer.username} already has their daily reviews!`);
    }
  });

  return Promise.all(tasks);
}
