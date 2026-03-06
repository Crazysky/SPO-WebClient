/**
 * Jest setup for component smoke tests (jsdom environment).
 * Imports @testing-library/jest-dom matchers (toBeInTheDocument, etc.).
 */

import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — stub it globally
Element.prototype.scrollIntoView = () => {};

// jsdom doesn't implement SVG geometry methods — stub them
(SVGElement.prototype as unknown as Record<string, unknown>).getTotalLength = () => 0;

