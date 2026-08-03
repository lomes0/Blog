/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function setDomHiddenUntilFound(dom: HTMLElement): void {
  // @ts-expect-error: "until-found" is a non-standard value not in HTMLElement types
  dom.hidden = "until-found";
}

export function domOnBeforeMatch(dom: HTMLElement, callback: () => void): void {
  // onbeforematch reached lib.dom in TypeScript 5.9, so this no longer needs a
  // suppression. `hidden = "until-found"` above still does.
  dom.onbeforematch = callback;
}
