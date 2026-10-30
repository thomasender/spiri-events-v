// Tiny place list for component tests (same shape as src/data/placeIndex.json).
// Rows: [name, lat, lon, stateIdx, districtIdx | -1, postcodeCount]
// "state" = the region the place lies in.
export const RAW_INDEX = {
  states: [
    ['st-gallen', 47.3, 9.2],
    ['zuerich', 47.4, 8.6],
    ['tirol', 47.2, 11.4],
    ['aargau', 47.4, 8.1],
  ],
  districts: [
    ['CH|Rorschach', 47.47, 9.49],
    ['CH|Rheintal', 47.38, 9.55],
    ['CH|Horgen', 47.23, 8.6],
    ['CH|Winterthur', 47.5, 8.72],
    ['CH|Werdenberg', 47.17, 9.47],
    ['CH|Aarau', 47.39, 8.05],
    ['AT|Innsbruck (Stadt)', 47.27, 11.4],
  ],
  places: [
    ['Rorschach (Bodensee)', 47.478, 9.49, 0, 0, 101],
    ['Altstätten', 47.377, 9.548, 0, 1, 12],
    ['Wädenswil', 47.229, 8.672, 1, 2, 90],
    ['Winterthur', 47.5, 8.724, 1, 3, 80],
    ['Buchs', 47.168, 9.478, 0, 4, 3],
    ['Buchs', 47.393, 8.082, 3, 5, 9],
    ['Kleinort', 47.5, 8.6, 1, -1, 1],
    ['Innsbruck', 47.269, 11.404, 2, 6, 50],
  ],
};
