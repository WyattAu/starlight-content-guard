export { frontmatterValidator } from './frontmatter.js';
export { descriptionsValidator } from './descriptions.js';
export { linksValidator } from './links.js';
export { mdxSyntaxValidator } from './mdx-syntax.js';
export { mathValidator } from './math.js';
export { imagesValidator } from './images.js';

import type { Validator } from '../types.js';
import { frontmatterValidator } from './frontmatter.js';
import { descriptionsValidator } from './descriptions.js';
import { linksValidator } from './links.js';
import { mdxSyntaxValidator } from './mdx-syntax.js';
import { mathValidator } from './math.js';
import { imagesValidator } from './images.js';

export const allValidators: Validator[] = [
  frontmatterValidator,
  descriptionsValidator,
  linksValidator,
  mdxSyntaxValidator,
  mathValidator,
  imagesValidator,
];
