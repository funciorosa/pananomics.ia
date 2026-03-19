const { createReqRes } = require("./utils/compat");
const handler = require("../../api/generate-pptx");

exports.handler = async function (event) {
  const { req, res, getResult } = createReqRes(event);
  await handler(req, res);
  return getResult();
};
