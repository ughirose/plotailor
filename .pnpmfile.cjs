module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.dependencies) {
        delete pkg.dependencies['@worldcraft/core'];
        delete pkg.dependencies['@worldcraft/schema'];
      }
      return pkg;
    }
  }
};
