// e1-poster-wide.jpg is 1440 × 836 with the bike in its right half (wheels x 603–1355, bars to tyres y 243–690):
// shown whole on a phone, the bike is a strip. Drawn 1.5× the screen's width in a 4:3 frame, it fills the frame.
const IMAGE = { width: 1440, height: 836 };
const BIKE = { x: (603 + 1355) / 2, y: (243 + 690) / 2 };
const ZOOM = 1.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** the home poster's frame for a screen `width` wide, and where the image sits in it to centre the bike */
export function posterFrame(width: number) {
  const height = width * 0.75;
  const scale = (width * ZOOM) / IMAGE.width;
  const image = { width: IMAGE.width * scale, height: IMAGE.height * scale };
  // centred on the bike, but never so far that the image stops short of an edge of the frame
  const left = clamp(width / 2 - BIKE.x * scale, width - image.width, 0);
  const top = clamp(height / 2 - BIKE.y * scale, height - image.height, 0);
  return { width, height, image: { ...image, left, top } };
}
