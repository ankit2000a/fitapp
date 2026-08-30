from PIL import Image

img_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
img = Image.open(img_path)
w, h = img.size

sparkle_pixels = []
for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        # Look for pixels inside the squircle that are not black (< 40) and not white (> 220)
        if 40 < r < 220 or 40 < g < 220 or 40 < b < 220:
            # Let's see if it has some purple tint (blue/red higher than green)
            if b > g + 20 and r > g + 20:
                sparkle_pixels.append((x, y, (r, g, b)))

print(f"Found {len(sparkle_pixels)} sparkle-like pixels.")
if sparkle_pixels:
    # Print sample colors
    print("Samples:", sparkle_pixels[len(sparkle_pixels)//2 - 5 : len(sparkle_pixels)//2 + 5])
