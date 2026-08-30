const stripEmojis = (str) => {
  return str.replace(/[\u1F600-\u1F64F]|[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
};

console.log("stripEmojis('Akshay Singh'):", stripEmojis('Akshay Singh'));
console.log("stripEmojis('akshaysingh78'):", stripEmojis('akshaysingh78'));
console.log("stripEmojis('Anonymous'):", stripEmojis('Anonymous'));
