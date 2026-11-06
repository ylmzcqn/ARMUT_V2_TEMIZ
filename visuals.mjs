// Simgeler kategoriyi temsil eder; ürün fotoğrafı veya fiziksel pin haritası değildir.
const paths = {
  board: 'M6 3h12v18H6z M9 7h6v7H9z M10 18h4 M3 6h3m-3 4h3m-3 4h3m-3 4h3m12-12h3m-3 4h3m-3 4h3m-3 4h3',
  display: 'M3 4h18v13H3z M8 21h8m-4-4v4 M6 8h7m-7 3h11',
  imu: 'm12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5M12 12v10 M12 5v3m-6 8 3-2m9 2-3-2',
  proximity: 'M4 9a8 8 0 0 1 16 0M7 9a5 5 0 0 1 10 0 M10 9a2 2 0 0 1 4 0 M5 15h14v6H5z M8 18h1m6 0h1',
  microphone: 'M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v4m-4 0h8',
  amplifier: 'M6 3h12v18H6z M9 7l7 5-7 5z M2 8h4m-4 8h4m12-8h4m-4 8h4',
  speaker: 'M3 9h4l6-5v16l-6-5H3z M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  camera: 'M3 6h12v12H3z M15 10l6-3v10l-6-3 M6 10h5v4H6z',
  servo: 'M5 10h14v10H5z M9 10V6h6v4 M12 6V3m-5 0h10 M9 15h6m-3-3v6',
  radar: 'M12 12 19 5 M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M11 12h2 M12 11v2',
};
export function svgNode(tag, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
export function icon(kind = 'board', className = 'module-icon') {
  const svg = svgNode('svg', {viewBox:'0 0 24 24', class:className, 'aria-hidden':'true'});
  svg.append(svgNode('path', {d:paths[kind] || paths.board}));
  return svg;
}
