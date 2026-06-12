# Infinite Carousel Implementation Spec

Build a responsive, infinite carousel using HTML, CSS, and vanilla JavaScript.

## Core Model

The carousel is a fixed logical ring of slides.

Each slide has a permanent logical index. The logical order never changes, even if DOM elements are reordered to support the infinite carousel experience.

The active slide’s logical index is the single source of truth. Slide rendering, index indicators, responsive layout, navigation, and active states must all derive from the active logical index.

## Infinite Behavior

The carousel must have no visible beginning or end.

Previous and Next controls are always available when there is more than one navigable slide.

Clicking Previous always moves one logical slide backward.

Clicking Next always moves one logical slide forward.

The carousel must support continuous navigation in either direction from any slide.

The user must never see a jump cut, snap-back, disabled edge state, or visual reset when moving between slides.

DOM reordering, slide recycling, or cloning is allowed if needed to preserve the infinite scrolling illusion.

## Visible Slide Counts

Slides are equal width.

Use odd visible slide counts so the active slide can always be centered.

Visible slide behavior:

- 1 slide total: show 1 slide at all viewport sizes.
- 2 slides total: show 1 slide at all viewport sizes.
- 3 slides total: show 1 slide on mobile, 3 slides at 600px and above.
- 4 slides total: show 1 slide on mobile, 3 slides at 600px and above.
- 5+ slides total:
  - default/mobile: show 1 slide
  - 600px and above: show 3 slides
  - 900px and above: show 5 slides

## Active Slide

The active slide is always centered in the carousel wrapper.

The active slide must be marked as current/active.

The active index indicator must represent the same logical slide as the active slide.

There must never be a state where the active slide and active index indicator point to different logical indexes.

The visible slides must always be the active slide’s nearest logical neighbors in the logical ring.

### Examples for a 9-slide carousel:

**Current slide 1:**

Mobile:  [1]
Tablet:  9 [1] 2
Desktop: 8 9 [1] 2 3

**Current slide 7:**

Mobile:  [7]
Tablet:  6 [7] 8
Desktop: 5 6 [7] 8 9

**Current slide 9:**

Mobile:  [9]
Tablet:  8 [9] 1
Desktop: 7 8 [9] 1 2

## Navigation UI

Below the carousel, render a nav element containing:

- Previous button
- Index indicator dots
- Next button

Each slide has one corresponding index indicator dot.

Index indicators are rendered in permanent logical order and must never reorder, even if slides are reordered in the DOM.

The active index indicator must be marked current/active.

Clicking the active index indicator is allowed but should do nothing.

## Previous / Next Behavior

Previous moves backward by exactly one logical slide.

Next moves forward by exactly one logical slide.

Movement should use smooth scroll behavior.

After movement settles:

- the new active slide is centered
- the new active slide is marked active
- the matching index indicator is marked active
- visible neighboring slides are recalculated from the logical ring

## Swipe Behavior

Touch swipe/scroll is supported for mobile/touch experiences.

A swipe left moves forward exactly one logical slide.

A swipe right moves backward exactly one logical slide.

A single swipe must not advance more than one slide.

Swipe behavior should match Previous and Next behavior.

Do not implement desktop mouse dragging for v1.

## Index Indicator Behavior

Index dots are clickable.

Clicking an index dot navigates to that logical slide.

Index navigation must travel through the logical sequence, not use shortest-path optimization.

If the target index is greater than the current index, move forward through each intermediate slide until reaching the target.

**Example:**

current: 4
target: 9
4 → 5 → 6 → 7 → 8 → 9

If the target index is less than the current index, move backward through each intermediate slide until reaching the target.

**Example:**

current: 9
target: 2
9 → 8 → 7 → 6 → 5 → 4 → 3 → 2

Index navigation should use smooth scroll behavior and visibly progress through the logical sequence.

After the final transition settles, update the active slide and active index indicator.

## Transition / State Timing

Current state should update after the scroll transition settles.

Do not update the active slide/index before the movement is complete.

Navigation requests made during an active transition should be queued and processed in order.

This applies to:

- Previous clicks
- Next clicks
- Swipe gestures
- Index dot clicks

## Resize Behavior

The carousel must not break when the viewport changes.

The active logical slide must remain the active slide across breakpoint changes.

Resizing must not advance or rewind the carousel.

When the visible slide count changes, recalculate the rendered visible slides from the logical ring and keep the active slide centered.

After resize, the visible slides must still be the active slide’s nearest logical neighbors.

**Example:**

Current slide: 7
Mobile:  [7]
Tablet:  6 [7] 8
Desktop: 5 6 [7] 8 9

Do not preserve stale DOM order if it conflicts with the logical ring.

## Accessibility / State Attributes

Use appropriate active/current attributes for both slides and index indicators.

Preferred approach:

- Active slide: data-state="active"
- Active index indicator: aria-current="true" and data-active="true"

Only one slide and one index indicator should be active at a time.

Buttons must have clear accessible labels:

- Previous slide
- Next slide
- Go to slide {n}

## Autoplay

Do not implement autoplay in the default carousel.

Autoplay may be added later as a variant, but it is out of scope for this implementation.

## Implementation Priorities

Prioritize correctness of the logical ring and active state over preserving DOM order.

DOM order may change at any time.

Logical slide order must never change.

The carousel should behave like a circular, state-driven component rather than a finite scroll container.