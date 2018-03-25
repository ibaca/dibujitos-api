const slug = require('slug')
const {promisify} = require('util')
const kitsu = require('node-kitsu')
const redis = require('redis')
const cacheDB = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_HOST
)
cacheDB.on('error', (err) => {
  console.error(err);
})
const cacheGet = promisify(cacheDB.get).bind(cacheDB)
const cacheSet = promisify(cacheDB.setex).bind(cacheDB)
const CACHE_EXPIRE_TIME = 60 * 60 * 24 * 2; // 2 days

async function fetchMetadata(slug) {
  const cached = await cacheGet(slug);
  if(cached) {
    return JSON.parse(cached);
  }
  const response = await kitsu.searchAnime(slug, 0);
  if(!response.length) {
    return Promise.reject(`Anime not found for slug ${slug}`)
  }
  const data = {
    ...response[0].attributes,
    id: response[0].id
  }
  await cacheSet(slug, CACHE_EXPIRE_TIME, JSON.stringify(data));
  return data;
}

function parseTorrent(torrent) {
  const parts = getNameParts(torrent.name);
  return {
    fileSize: torrent.fileSize,
    timestamp: parseInt(torrent.timestamp),
    seeders: parseInt(torrent.seeders),
    leechers: parseInt(torrent.leechers),
    numDownloads: parseInt(torrent.nbDownload),
    link: torrent.links.magnet,
    showTitle: parts.showTitle,
    slug: slug(parts.showTitle).toLowerCase(),
    episodeNumber: parts.episodeNumber,
    quality: parts.quality,
    isBatch: parts.isBatch,
    fullTitle: torrent.name
  }
}

function getNameParts(name) {
  const parts = name.replace(/]/g, "[")
    .split("[")
    .filter(Boolean)
    .map(s => s.trim())
  const user = parts[0];
  const title = parts[1];
  const quality = parts[2];
  const isBatch = parts.some(
    part => part === '(Batch)' || part === 'Batch'
  );
  let showTitle = '';
  let episodeNumber = '';
  if(isBatch) {
    showTitle = title.replace(/ \(.*/, ""); 
  } else {
    const episodeIndex = title.lastIndexOf(' - ');
    showTitle = title.substr(0, episodeIndex)
    episodeNumber = title.substr(episodeIndex + 3);
  }
  return {
    user,
    showTitle,
    episodeNumber,
    quality,
    isBatch,
  }
}

function groupBy(array, predicate) {
  const cb = typeof predicate === 'function' ? predicate : (o) => o[predicate];

  return array.reduce(function(groups, item) {
    const val = cb(item)
    groups[val] = groups[val] || []
    groups[val].push(item)
    return groups
  }, {})
}

exports.groupBy = groupBy;
exports.parseTorrent = parseTorrent;
exports.getNameParts = getNameParts;
exports.fetchMetadata = fetchMetadata;
