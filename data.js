const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const marked = require('marked');
const { getHours, getScore } = require('./data-helpers');

function parseFile(filename) {
  const file = fs.readFileSync(filename, 'utf8');
  const split = file.split('---');
  const data = yaml.parse(split[1]);
  const markdown = split.slice(2).join('---').trim();
  if (markdown) {
    data.markdown = markdown;
    data.content = marked(markdown);
  }
  return data;
}

function filterValidFiles(filename) {
  return !filename.startsWith('.');
}

function getPlaceDescription(place) {
  const { type, cityName, area, power, wifi, speed, markdown } = place;
  
  let text;
  if (area) {
    text = `${type} in ${area}, ${cityName}.`
  } else {
    text = `${type} in ${cityName}.`
  }
  if (power && wifi && speed) {
    text += ` ${speed} Mb/s WiFi and power outlets available.`
  } else if (power && wifi) {
    text += ` WiFi and power outlets available.`
  } else if (power) {
    text += ` Power outlets available.`
  } else if (wifi && speed) {
    text += ` ${speed} Mb/s WiFi available.`
  } else if (wifi) {
    text += ` WiFi available.`;
  } 
  if (markdown) {
    text += ` ${markdown}`;
  }
  return text;
}

function getCityDescription(city) {
  return `Explore cafes and coworking spaces in ${city.name}, ${city.country}. Find the best places with power outlets and fast WiFi to work or study from.`;
}

function parseCoordinates(coords) {
  if (coords) {
    const [lat, lng] = coords.split(',').map(e => Number(e.trim()));
    return [lng, lat];
  } else {
    return undefined;
  }
}

function getUrlFriendlyName(name) {
  return name.toLowerCase()
    .split(' / ').join('-')
    .split(' - ').join('-')
    .split(' & ').join('-')
    .split('/').join('-')
    .split(' ').join('-');
}

function getPlaces() {
  const places = [];
  const cityDirs = fs.readdirSync('data/').filter(filterValidFiles);
  for (const cityId of cityDirs) {
    const placeFiles = fs.readdirSync(`data/${cityId}/`).filter(filterValidFiles);
    for (const placeFile of placeFiles) {
      if (placeFile != 'index.md') {
        const placeData = parseFile(`data/${cityId}/${placeFile}`);
        const name = path.basename(placeFile, '.md');
        const place = Object.assign(placeData, {
          id: name,
          url: `/${cityId}/${name}/`,
          title: placeData.name,
          coordinates: parseCoordinates(placeData.coordinates),
          city: cityId,
          file: `${cityId}/${placeFile}`,
          score: getScore(placeData),
          hours: getHours(placeData.hours),
        });
        if (place.images) {
          place.images = place.images.map(image => `${place.url}${image}`);
        }
        places.push(place);
      }
    }
  }
  return _(places)
    .orderBy('score', 'desc')
    .value();
}

function getCities(places) {
  const cities = {};
  for (const place of places) {
    const cityData = parseFile(`data/${place.city}/index.md`);
    const id = place.city;
    if (!cities[place.city]) {
      const city = Object.assign(cityData, {
        id,
        url: `/${id}/`,
        title: cityData.name,
        coordinates: parseCoordinates(cityData.coordinates),
        places: [],
      });
      city.description = getCityDescription(city);
      cities[place.city] = city;
    }
    place.cityUrl = `/${id}/`;
    place.cityName = cityData.name;
    place.description = getPlaceDescription(place);
    cities[place.city].places.push(place);
  }
  return _(cities)
    .values()
    .orderBy(e => e.places.length, 'desc')
    .value();
}

function getAreas(places) {
  const areas = {};
  for (const place of places) {
    if (place.area && place.content && place.images && place.score >= 3 && !place.closed) {
      if (!areas[place.area]) {
        const id = getUrlFriendlyName(place.area);
        areas[place.area] = {
          id,
          name: place.area,
          url: `/${place.city}/area/${id}/`,
          title: `${place.area} Area`,
          city: place.city,
          places: [],
        };
      }
      areas[place.area].places.push(place);
    }
  }
  for (const place of places) {
    if (areas[place.area]) {
      place.areaUrl = areas[place.area].url;
    }
  }
  return _(areas)
    .values()
    .orderBy('name')
    .value();
}

function getStations(places) {
  const stations = {};
  for (const place of places) {
    if (place.station && place.content && place.images && place.score >= 3 && !place.closed) {
      for (const station of place.station.split(',').map(e => e.trim())) {
        if (!stations[station]) {
          const id = getUrlFriendlyName(station);
          stations[station] = {
            id,
            name: station,
            url: `/${place.city}/station/${id}/`,
            title: `${station} Station`,
            city: place.city,
            places: [],
          }
        }
        stations[station].places.push(place);
      }
    }
  }
  for (const place of places) {
    if (stations[place.station]) {
      place.stationUrl = stations[place.station].url;
    }
  }
  return _(stations)
    .values()
    .orderBy('name')
    .value();
}

function load() {
  const t1 = Date.now();

  const places = getPlaces();
  const cities = getCities(places);
  const areas = []; //getAreas(places);
  const stations = []; //getStations(places);

  const recent = _(places)
    .filter(e => !!e.added)
    .orderBy('added', 'desc')
    .take(10)
    .value();

  const top = _(places)
    .orderBy('score', 'desc')
    .take(10)
    .value();

  const t2 = Date.now();
  console.log(`Loaded ${cities.length} cities, ${places.length} places, ${areas.length} areas, ${stations.length} stations in ${t2 - t1} ms`);

  return { cities, places, areas, stations, recent, top };
}

module.exports = { load };
