const { createReqRes } = require("./utils/compat");
const handler = require("../../api/preview-slide");

exports.handler = async function (event) {
  const { req, res, getResult } = createReqRes(event);
  await handler(req, res);
  return getResult();
};
