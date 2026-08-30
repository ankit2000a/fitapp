from PIL import Image

img_path = "/Users/akshay/Documents/Build/FitApp/icon.png"
img = Image.open(img_path)

# Let's check some pixels along the border and in the middle
w, h = img.size
non_white_pixels = []
for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))
        if r < 240 or g < 240 or b < 240:
            non_white_pixels.append((x, y))

if non_white_pixels:
    xs = [p[0] for p in non_white_pixels]
    ys = [p[1] for p in non_white_pixels]
    print(f"Non-white region bounding box: x in [{min(xs)}, {max(xs)}], y in [{min(ys)}, {max(ys)}]")
else:
    print("All white!")
