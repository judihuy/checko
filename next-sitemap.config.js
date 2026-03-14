/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://checko.ch",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    additionalSitemaps: [],
  },
  exclude: ["/admin/*", "/dashboard/*", "/api/*"],
};
