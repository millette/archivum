'use strict'

const got = require("got")
const pkg = require("./package.json")

const BASE_URL = "https://web.archive.org/"
const WEEK_SECONDS = 24 * 7 * 60 * 60

const reDate = /^([\d]{4})([\d]{2})([\d]{2})([\d]{2})([\d]{2})([\d]{2})$/

class BadResponseError extends Error {
  constructor({ statusCode, headers, url }, m = "Bad response from archive.org.") {
    super(m)
    this.statusCode = statusCode
    this.headers = headers
    this.url = url
  }
}

class TooSoonError extends Error {
  constructor({ elapsed, min, url }, m = "Too soon.") {
    super(m)
    this.elapsed = elapsed
    this.min = min
    this.url = url
  }
}

class NotLiveError extends Error {
  constructor({ url }, m = "Given URL is not live.") {
    super(m)
    this.url = url
  }
}

const elapsed = (s) => {
  const m = s.match(reDate).slice(1)
  m[1] -= 1
  return Math.max(0, Math.round((Date.now() - Date.UTC(...m)) / 1000))
}

const gotHeaders = { "user-agent": `${pkg.name} v${pkg.version}` }

const known = async (url) => {
  const u = new URL("/__wb/sparkline?collection=web&output=json", BASE_URL)
  u.searchParams.set("url", url)
  const { body } = await got(u, { headers: gotHeaders, json: true })
  return {
    ...body,
    url
  }
}

const archive = async (url) => {
  const { headers, statusCode } = await got.head(new URL(`/save/${url}`, BASE_URL), { headers: gotHeaders })
  if ((statusCode === 200) && headers["content-location"]) {
    return {
      url,
      location: new URL(headers["content-location"], BASE_URL).href,
      contentLength: headers["x-archive-orig-content-length"],
      server: headers["x-archive-orig-server"],
      cacheKey:  headers["x-cache-key"]
    }
  }

  throw new BadResponseError({ statusCode, headers, url })
}

const shouldArchive = async (url, min) => {
  const { last_ts, is_live } = await known(url)
  if (last_ts) {
    const el = elapsed(last_ts)
    if (el > min) return
    throw new TooSoonError({ url, elapsed: el, min })
  }
  if (!is_live) throw new NotLiveError({ url })
}

const run = async (url, opts = { min: WEEK_SECONDS }) => {
  await shouldArchive(url, opts.min)
  // return "ok"
  return archive(url)
}

run("tiguidou.waglo.com/nouveau")
.then(console.log)
.catch(console.error)
