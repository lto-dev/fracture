/**
 * Simple utility library for testing external library loading
 */

module.exports = {
  formatTitle: function(text) {
    return text.toUpperCase();
  },
  
  slugify: function(text) {
    return text.toLowerCase().replace(/\s+/g, '-');
  },
  
  truncate: function(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
};
