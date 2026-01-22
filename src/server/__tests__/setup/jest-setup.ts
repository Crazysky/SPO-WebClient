/**
 * Jest Setup File
 * Loads custom matchers for all tests
 */

import { rdoMatchers } from '../matchers/rdo-matchers';

// Extend Jest matchers with RDO-specific matchers
expect.extend(rdoMatchers);
