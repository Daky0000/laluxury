// Extends app.json. With IOS_FREE_SIGNING=1 (local builds signed with a free
// Apple ID), the capabilities a free "Personal Team" cannot sign are removed:
// push notifications and associated domains (universal links). Everything
// else in the app works the same.
const { withEntitlementsPlist } = require("expo/config-plugins");

const withoutPaidCapabilities = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    delete cfg.modResults["com.apple.developer.associated-domains"];
    return cfg;
  });

module.exports = ({ config }) => {
  if (process.env.IOS_FREE_SIGNING !== "1") return config;
  const ios = { ...config.ios };
  delete ios.associatedDomains;
  return {
    ...config,
    ios,
    plugins: [...(config.plugins ?? []), withoutPaidCapabilities],
  };
};
