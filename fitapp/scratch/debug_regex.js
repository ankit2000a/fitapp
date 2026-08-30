const parts = [
  /[\u1F600-\u1F64F]/g,
  /[\u2700-\u27BF]/g,
  /[\uE000-\uF8FF]/g,
  /\uD83C[\uDC00-\uDFFF]/g,
  /\uD83D[\uDC00-\uDFFF]/g,
  /[\u2011-\u26FF]/g,
  /[\uD83E\uDD10-\uDDFF]/g // wait, original was \uD83E[\uDD10-\uDDFF]
];

const testStr = 'Akshay Singh';

parts.forEach((p, idx) => {
  console.log(`Part ${idx} (${p}):`, testStr.match(p));
});
