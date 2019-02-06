const crypto = require('crypto');
const got = require('got');
const url = require('url');
const Datastore = require('@google-cloud/datastore');

const settings = require('./settings.json');
const projectId = settings.projectId;

// Creates a client for Google Cloud Datastore
const datastore = new Datastore({
  projectId: projectId
});

exports.handleReview = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // We only care about the "submitted" action
  if (req.body.action !== 'submitted') {
    res.end();
    return;
  }

  // We only care about Approved and Request Changes
  const states = ['approved', 'changes_requested'];
  const reviewState = req.body.review.state;
  if (!states.includes(reviewState)) {
    res.end();
    return;
  }

  // We only care about specific reviewers
  if (!settings.reviewers.includes(req.body.review.user.login)) {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  // We only care about specific repos
  if (!settings.repos.includes(pullRequest.head.repo.name)) {
    res.end();
    return;
  }

  return (
    // Validate the request
    validateRequest(req)
      // Store the review in Google Datastore
      .then(() => storeReview(req.body.review))
      .then(() => setLabels(reviewState, pullRequest))
      .then(() => removeLabels(reviewState, pullRequest))
      .then(() => {
        console.log(`Saved review from ${req.body.review.user.login}`);
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

function storeReview(review) {
  // The kind for the new entity
  const kind = 'GithubReview';
  // The ID for the new entity
  const id = review.id;
  // The Cloud Datastore key for the new entity
  const key = datastore.key([kind, id]);

  // Prepares the new entity
  const reviewEntity = {
    user: review.user.login,
    userId: review.user.id,
    state: review.state,
    url: review.html_url,
    submittedAt: new Date(review.submitted_at)
  };

  const entity = {
    key: key,
    data: reviewEntity
  };

  // Saves the entity
  return datastore.insert(entity);
}

function setLabels(reviewState, pullRequest) {
  const labels = pullRequest.labels;
  let label;

  if (reviewState === 'changes_requested') {
    label = 'Needs: Revision';
  } else {
    if (labels.find(label => label.name === 'Status: Ready To Ship')) {
      label = 'Status: Ready To Ship';
    } else if (labels.find(label => label.name === 'Status: Review Complete')) {
      label = 'Status: Review Complete';
    } else if (labels.find(label => label.name === 'Status: Reviewed')) {
      label = 'Status: Review Complete';
    } else {
      label = 'Status: Reviewed';
    }
  }

  return makeRequest(`${pullRequest.issue_url}/labels`, {
    body: [label]
  });
}

function removeLabels(reviewState, pullRequest) {
  const labels = pullRequest.labels;
  let labelsToRemove = ['Status: Revised'];
  const currentLabelNames = labels.map(label => label.name);

  if (reviewState === 'changes_requested') {
    labelsToRemove.push('Status: Reviewed', 'Status: Review Complete');
  }

  const tasks = labelsToRemove.map(label => {
    if (currentLabelNames.includes(label)) {
      return makeRequest(`${pullRequest.issue_url}/labels/${label}`, {
        method: 'DELETE'
      });
    }
  });

  return Promise.all(tasks);
}
