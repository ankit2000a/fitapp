const stripEmojis = (str) => {
  if (!str) return '';
  return str.replace(/[\u2600-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();
};

console.log("stripEmojis('Akshay Singh 🔥'):", stripEmojis('Akshay Singh 🔥'));
console.log("stripEmojis('akshaysingh78 👏'):", stripEmojis('akshaysingh78 👏'));
console.log("stripEmojis('Anonymous'):", stripEmojis('Anonymous'));
