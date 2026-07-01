const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'slides');

async function createGradient(filename, color1, color2, angle = '135') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1}"/>
        <stop offset="100%" style="stop-color:${color2}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, filename));
}

async function createIcon(filename, svgContent, size = 128) {
  await sharp(Buffer.from(svgContent)).resize(size, size).png().toFile(path.join(dir, filename));
}

(async () => {
  // Title slide gradient
  await createGradient('bg-title.png', '#0D7377', '#1B2631');
  // Section divider gradient
  await createGradient('bg-section.png', '#1B2631', '#0D7377');
  // Light background
  await createGradient('bg-light.png', '#F8F9FA', '#EBF5FB');
  // Dark background for closing
  await createGradient('bg-closing.png', '#1B2631', '#0D7377');

  // Simple geometric accent shapes
  const accentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <circle cx="100" cy="100" r="90" fill="#0D7377" opacity="0.15"/>
    <circle cx="100" cy="100" r="60" fill="#0D7377" opacity="0.1"/>
  </svg>`;
  await createIcon('accent-circle.png', accentSvg, 200);

  // Arrow icon
  const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24">
    <path d="M5 12h14M12 5l7 7-7 7" stroke="#0D7377" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  await createIcon('arrow.png', arrowSvg, 64);

  console.log('Assets created.');
})();
