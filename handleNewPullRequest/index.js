const crypto = require('crypto');
const got = require('got');
const url = require('url');
const slack = require('slack');

const settings = require('./settings.json');

/**
 * Assigns a reviewer to a new pull request from a list of eligible reviewers.
 * Reviewers with the least assigned reviews on open pull requests will be
 * prioritized for assignment.
 *
 * @param {object} req
 * @param {object} res
 */
exports.handleNewPullRequest = (req, res) => {
  // We only care about opened pull requests
  const actions = ['opened', 'reopened'];
  if (!actions.includes(req.body.action)) {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;
  const repository = req.body.repository;

  // We only care about specific repos
  if (!settings.repos.includes(pullRequest.head.repo.name)) {
    res.end();
    return;
  }

  console.log(`New PR: ${pullRequest.title} on ${pullRequest.head.repo.name}`);

  // Validate the request
  return (
    validateRequest(req)
      // Download all pull requests
      // .then(() => getPullRequests(pullRequest.base.repo))
      // Figure out who should review the new pull request
      .then(() => getNextReviewers(pullRequest))
      // Assign a reviewer to the new pull request
      .then(reviewers => assign(reviewers, pullRequest))
      .then(() => fetchChangedFiles(pullRequest))
      .then(filesChanged => parseChangedFiles(pullRequest, filesChanged))
      .then(() => checkForTypeLabel(pullRequest))
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
  return got(parts, options).then(res => res.body);
}

function getPullRequests(repo, page) {
  const PAGE_SIZE = 100;

  if (!page) {
    page = 1;
  }

  // Retrieve a page of pull requests
  return makeRequest(`${repo.url}/pulls`, {
    query: {
      sort: 'updated',
      page: page,
      per_page: PAGE_SIZE
    }
  }).then(pullRequests => {
    // Filter out requested reviews who are not found in "settings.reviewers"
    pullRequests.forEach(pr => {
      pr.requested_reviewers || (pr.requested_reviewers = []);
      // Filter out reviewers not found in "settings.reviewers"
      pr.requested_reviewers = pr.requested_reviewers.filter(reviewer => {
        return settings.reviewers.includes(reviewer.login);
      });
    });

    // If more pages exists, recursively retrieve the next page
    if (pullRequests.length === PAGE_SIZE) {
      return getPullRequests(repo, page + 1).then(_pullRequests =>
        pullRequests.concat(_pullRequests)
      );
    }

    // Finish by retrieving the pull requests' reviews
    return getReviewsForPullRequests(pullRequests);
  });
}

function getReviewsForPullRequests(pullRequests) {
  console.log(`Retrieving reviews for ${pullRequests.length} pull requests.`);
  // Make a request for each pull request's reviews
  const tasks = pullRequests.map(pr => makeRequest(`${pr.url}/reviews`));
  // Wait for all requests to complete
  return Promise.all(tasks).then(responses => {
    responses.forEach((reviews, i) => {
      reviews || (reviews = []);
      // Attach the reviews to each pull request
      pullRequests[i].reviews = reviews
        // Filter out reviews whose reviewers are not found in
        // "settings.reviewers"
        .filter(review => settings.reviewers.includes(review.user.login))
        // Only reviews with changes requested count against a reviewer's
        // workload
        .filter(review => review.state === 'CHANGES_REQUESTED');
    });
    return pullRequests;
  });
}

function calculateWorkloads(pullRequests) {
  // Calculate the current workloads of each reviewer
  const reviewers = {};
  settings.reviewers.forEach(reviewer => {
    reviewers[reviewer] = 0;
  });
  pullRequests.forEach((pr, i) => {
    // These are awaiting the reviewer's initial review
    pr.requested_reviewers.forEach(reviewer => {
      reviewers[reviewer.login]++;
    });
    // For these the reviewer has requested changes, and has yet to approve the
    // pull request
    pr.reviews.forEach(review => {
      reviewers[review.user.login]++;
    });
  });

  console.log(JSON.stringify(reviewers, null, 2));

  // Calculate the reviewer with the smallest workload
  let workloads = [];
  Object.keys(reviewers).forEach(login => {
    workloads.push({
      login: login,
      reviews: reviewers[login]
    });
  });
  workloads.sort((a, b) => a.reviews - b.reviews);

  console.log(`Calculated workloads for ${workloads.length} reviewers.`);

  return workloads;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getNextReviewers(pullRequest) {
  const reviewers = shuffle(
    settings.reviewers.filter(reviewer => {
      // remove the PR owner from set of reviewers
      return reviewer !== pullRequest.user.login;
    })
  );

  return [reviewers[0], reviewers[1]];

  // let workloads = calculateWorkloads(pullRequests);
  //
  // workloads = workloads
  //   // Remove reviewers who have a higher workload than the reviewer at the
  //   // front of the queue:
  //   .filter(workload => workload.reviews === workloads[0].reviews)
  //   // Remove the opener of the pull request from review eligibility:
  //   .filter(workload => workload.login !== pullRequest.user.login);
  //
  // console.log('Workloads: ', JSON.stringify(workloads, null, 2));
  //
  // const MIN = 0;
  // const MAX = workloads.length - 1;
  //
  // // Randomly choose from the remaining eligible reviewers:
  // const choice = Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;
  //
  // return workloads[choice].login;
}

function assign(reviewers, pullRequest) {
  const tasks = [
    assignToIssue(reviewers, pullRequest),
    assignReviewer(reviewers, pullRequest)
  ]

  return Promise.all(tasks);
}

function assignToIssue(reviewers, pullRequest) {
  const tasks = reviewers.map(reviewer => {
    console.log(`Assigning to issue: ${reviewer}`);

    return makeRequest(`${pullRequest.issue_url}/assignees`, {
      body: {
        assignees: [reviewer]
      }
    });
  });

  return Promise.all(tasks);
}

function assignReviewer(reviewers, pullRequest) {
  const tasks = reviewers.map(reviewer => {
    console.log(`Assigning to review: ${reviewer}`);

    return makeRequest(`${pullRequest.url}/requested_reviewers`, {
      body: {
        reviewers: [reviewer]
      }
    });
  });

  return Promise.all(tasks);
}

function fetchChangedFiles(pullRequest) {
  console.log('Fetching the changed files');
  console.log('Path: ', `${pullRequest.url}/files`);
  return makeRequest(`${pullRequest.url}/files`).then(files => {
    console.log('Files count: ', files.length);
    return files;
  });
}

function parseChangedFiles(pullRequest, filesChanged) {
  console.log('Parsing the changed files');
  return Promise.all([
    checkDatabaseChanges(pullRequest, filesChanged),
    checkGemfileChanges(pullRequest, filesChanged)
  ]);
}

function checkDatabaseChanges(pullRequest, filesChanged) {
  console.log('Checking for DB changes...');

  const databaseChanges = filesChanged.filter(file =>
    file.filename.includes('db/migrate')
  );

  if (databaseChanges.length > 0) {
    console.log('Found changes: ', databaseChanges.length);

    return Promise.all([
      addTypeDatabaseLabel(pullRequest),
      notifyBusinessIntelligence(pullRequest, databaseChanges)
    ]);
  } else {
    return Promise.resolve();
  }
}

function checkGemfileChanges(pullRequest, filesChanged) {
  console.log('Checking for Gemfile.lock changes...');

  const repo = pullRequest.head.repo.name;

  // Only run for the archimedes repo
  if (repo != 'archimedes') {
    return Promise.resolve();
  }

  const gemfileLockChanges = filesChanged.filter(file =>
    file.filename.includes('Gemfile.lock')
  );

  const gemfileNextLockChanges = filesChanged.filter(file =>
    file.filename.includes('Gemfile_next.lock')
  );

  if (gemfileLockChanges.length > 0 && gemfileNextLockChanges.length == 0) {
    console.log('Made changes to Gemfile.lock but not Gemfile_next.lock');
    return postGemfileBundleInstructions(pullRequest);
  } else {
    return Promise.resolve();
  }
}

function postGemfileBundleInstructions(pullRequest) {
  return makeRequest(`${pullRequest.issue_url}/comments`, {
    method: 'POST',
    body: {
      body: `Hi! While we are in the process of upgrading our Rails version, we need a manual intervention
      to keep our \`Gemfile.lock\` and \`Gemfile_next.lock\` files in sync. To resolve this, please
      run \`RAILS_NEXT=1 bundle install\` in your terminal and push the changes up.`
    }
  });
}

function addTypeDatabaseLabel(pullRequest) {
  // Adding the Type: Database label.
  return makeRequest(`${pullRequest.issue_url}/labels`, {
    method: 'POST',
    body: ['Type: Database']
  });
}

function notifyBusinessIntelligence(pullRequest, databaseChanges) {
  const repo = pullRequest.head.repo.name;

  if (!settings.businessIntelligenceRepos.includes(repo)) {
    return Promise.resolve();
  }

  // Notifying Business Intelligence
  return slack.chat.postMessage({
    token: settings.slackToken,
    channel: '#businessintelligence',
    text: `*Opened on ${repo}:* ${pullRequest.title}\n\n${databaseChanges
      .map(file => `\`\`\`${file.patch}\`\`\``)
      .join('\n')}`,
    username: 'storm',
    icon_url: 'https://s3-us-west-2.amazonaws.com/storm-app/icon.png?v=2'
  });
}

function checkForTypeLabel(pullRequest) {
  if (pullRequest.user.login === 'dependabot[bot]') {
    return Promise.resolve();
  }

  const labels = pullRequest.labels;
  const hasTypeLabel = labels.some(label => {
    const name = label.name;

    return (
      name.includes('Type:') ||
      name.includes('Dependency: Gems') ||
      name.includes('Dependency: Packages')
    );
  });

  if (hasTypeLabel) {
    return Promise.resolve();
  } else {
    console.log('Commenting to add a Type label');
    return makeRequest(`${pullRequest.issue_url}/comments`, {
      method: 'POST',
      body: {
        body: `@${pullRequest.user.login}, please add a \`Type\` label.`
      }
    });
  }
}
