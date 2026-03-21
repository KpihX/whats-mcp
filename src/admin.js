#!/usr/bin/env node
"use strict";

const { program } = require("./admin/cli");

if (require.main === module) {
  program.parse(process.argv);
}

module.exports = {
  program,
};
