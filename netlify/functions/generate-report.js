const { createReqRes } = require("./utils/compat");
const handler = require("../../api/generate-report");

exports.handler = async function (event) {
  const { req, res, getResult } = createReqRes(event);
  await handler(req, res);
  return getResult();
};
