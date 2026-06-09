const { join } = require("path");

const cacheDirectory = process.env.PUPPETEER_CACHE_DIR;
const useProjectCache =
  cacheDirectory || process.env.NODE_ENV === "production" || process.env.RENDER;

module.exports = useProjectCache
  ? {
      cacheDirectory:
        cacheDirectory || join(__dirname, ".cache", "puppeteer"),
    }
  : {};
