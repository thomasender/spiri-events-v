// Tiny place list for component tests (same shape as src/data/placeIndex.json).
// Rows: [name, lat, lon, stateIdx, districtIdx | -1, postcodeCount]
export const RAW_INDEX = {
  states: [
    ['bayern', 48.9, 11.4],
    ['nordrhein-westfalen', 51.4, 7.5],
    ['tirol', 47.2, 11.4],
  ],
  districts: [
    ['DE|Lindau (Bodensee)', 47.55, 9.71],
    ['DE|Oberallgäu', 47.6, 10.3],
    ['DE|Essen', 51.45, 7.01],
    ['DE|Dortmund', 51.5, 7.46],
    ['DE|Neustadt a.d.Waldnaab', 49.7, 12.2],
    ['DE|Neustadt a.d.Aisch-Bad Windsheim', 49.5, 10.6],
    ['AT|Innsbruck', 47.27, 11.4],
  ],
  places: [
    ['Lindau (Bodensee)', 47.55, 9.709, 0, 0, 101],
    ['Sonthofen', 47.51, 10.28, 0, 1, 12],
    ['Essen', 51.455, 7.012, 1, 2, 90],
    ['Dortmund', 51.514, 7.468, 1, 3, 80],
    ['Neustadt', 49.73, 12.17, 0, 4, 3],
    ['Neustadt', 49.58, 10.61, 0, 5, 9],
    ['Kleinort', 48.5, 11.0, 0, -1, 1],
    ['Innsbruck', 47.269, 11.404, 2, 6, 50],
  ],
};
