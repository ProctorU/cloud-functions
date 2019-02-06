var fetch = require('isomorphic-fetch@2.2.0');

module.exports = function(cb) {
  fetch(
    'https://us-central1-team-196819.cloudfunctions.net/handleDailyReview'
  ).then(function(response) {
    if (response.status >= 400) {
      throw new Error('Bad response from server');
    }
    cb();
  });
};
