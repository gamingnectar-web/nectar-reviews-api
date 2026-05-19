const { createToken } = require('../security/credentials.service');

function requestContext(req, res, next) {
  req.requestId = req.get('x-request-id') || createToken(8);
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestContext };
