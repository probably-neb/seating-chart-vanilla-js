import "./style.css";

const SEAT_GRID_W = 4;
const SEAT_GRID_H = 4;

// grid
const gridW = 80;
const gridH = 40;
const gridCellPx = Math.floor(window.innerWidth / gridW);

// seats
const SEAT_TRANSFORM =
    "translate(calc(var(--grid-cell-px) * var(--grid-x)), calc(var(--grid-cell-px) * var(--grid-y)))";
const SEAT_DATA_IDENTIFIER = "seat";
const SEAT_ID_PREFIX = "drag-";
let next_draggable_id = 0;
let seat_refs = [];
let seat_locs = [];

// container
let containerDomRect;

// selection
let is_creating_selection = false;
let selected_region;

// drag
const DRAG_DATA_TYPE_KIND = "application/kind";

const DRAG_DATA_TYPE_KIND_SEAT = "seat";
const DRAG_DATA_TYPE_KIND_SELECTION = "selection";

function assert(val, ...msg) {
    if (val) return;
    console.error("Assertion failed: ", ...msg);
    throw new Error("Assertion failed: " + msg?.map(String).join(" ") ?? "");
}

const app = document.getElementById("app");
assert(app != null, "app not null");

const invisible_drag_preview = document.createElement("span");
invisible_drag_preview.style.display = "none";
app.appendChild(invisible_drag_preview);

const container = document.createElement("div");
container.id = "canvas";
container.className = "relative bg-white";
container.style.setProperty("--grid-cell-px", gridCellPx + "px");
container.style.width = gridW * gridCellPx + "px";
container.style.height = gridH * gridCellPx + "px";
container.ondragover = function (event) {
    event.preventDefault();
};
container.style.backgroundImage = `
                        linear-gradient(to right, #e5e5e5 1px, transparent 1px),
                        linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
                    `;
container.style.backgroundSize = `var(--grid-cell-px) var(--grid-cell-px)`;

const selection = document.createElement("div");
selection.id = "selection";
selection.className = "absolute bg-blue-300/40 ring-2 ring-blue-500 z-5";
selection.style.display = "none";
selection.draggable = true;
container.appendChild(selection);

selection.ondragstart = function (event) {
    console.log("selection ondragstart");
    if (is_creating_selection || selected_region == null) {
        console.log("selection not ondragstart");
        event.preventDefault();
        return;
    }
    event.dataTransfer.setData(
        DRAG_DATA_TYPE_KIND,
        DRAG_DATA_TYPE_KIND_SELECTION,
    );
    event.dataTransfer.setDragImage(invisible_drag_preview, 0, 0);
    elem_drag_offset_set(event.target, event.clientX, event.clientY);
};

selection.ondrag = function (event) {
    assert(containerDomRect != null, "containerDomRect not null");
    assert(selected_region != null, "selected_region not null");

    const [offsetX, offsetY] = elem_drag_offset_get(event.target);
    const gridX = clamp(
        Math.round(
            (event.clientX - containerDomRect.left - offsetX) / gridCellPx,
        ),
        0,
        gridW,
    );
    const gridY = clamp(
        Math.round(
            (event.clientY - containerDomRect.top - offsetY) / gridCellPx,
        ),
        0,
        gridH,
    );

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region;

    const width = endX - startX;
    const height = endY - startY;

    selected_region.start.gridX = gridX;
    selected_region.start.gridY = gridY;
    selected_region.end.gridX = gridX + width;
    selected_region.end.gridY = gridY + height;

    selection_update();
};

selection.ondragend = function (event) {
    if (selected_region == null) {
        console.warn("no selection on ondragend");
    }

    if (event.dataTransfer.dropEffect !== "none") {
        // drop succeeded
        return;
    }

}

function selection_region_is_normalized() {
    if (selected_region == null) {
        console.warn(
            "cannot check if selection region is normalized - region is null",
        );
        return;
    }

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region;

    return startX <= endX && startY <= endY;
}

function selection_region_normalize() {
    if (selected_region == null) {
        console.warn("cannot normalize selection - region is null");
        return;
    }
    const startX = Math.min(
        selected_region.start.gridX,
        selected_region.end.gridX,
    );
    const startY = Math.min(
        selected_region.start.gridY,
        selected_region.end.gridY,
    );
    const endX = Math.max(
        selected_region.start.gridX,
        selected_region.end.gridX,
    );
    const endY = Math.max(
        selected_region.start.gridY,
        selected_region.end.gridY,
    );

    const {
        start: { gridX: ostartX, gridY: ostartY },
        end: { gridX: oendX, gridY: oendY },
    } = selected_region;
    console.log(
        `b: [${ostartX},${ostartY}] [${oendX},${oendY}]`,
        `a: [${startX},${startY}] [${endX},${endY}]`,
    );

    selected_region.start.gridX = startX;
    selected_region.start.gridY = startY;
    selected_region.end.gridX = endX;
    selected_region.end.gridY = endY;
}

// PERF: remove usages of this function and have selected_region store an additonal feild called anchor
//       where selection always rotates around the anchor
function selected_region_normalized() {
    assert(selected_region != null, "selected_region not null");

    const startX = Math.min(
        selected_region.start.gridX,
        selected_region.end.gridX,
    );
    const startY = Math.min(
        selected_region.start.gridY,
        selected_region.end.gridY,
    );
    const endX = Math.max(
        selected_region.start.gridX,
        selected_region.end.gridX,
    );
    const endY = Math.max(
        selected_region.start.gridY,
        selected_region.end.gridY,
    );

    const {
        start: { gridX: ostartX, gridY: ostartY },
        end: { gridX: oendX, gridY: oendY },
    } = selected_region;
    console.log(
        `b: [${ostartX},${ostartY}] [${oendX},${oendY}]`,
        `a: [${startX},${startY}] [${endX},${endY}]`,
    );

    // selected_region.start.gridX = startX;
    // selected_region.start.gridY = startY;
    // selected_region.end.gridX = endX;
    // selected_region.end.gridY = endY;
    return {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    }
}

function selected_region_end_set(newX, newY) {
    assert(selected_region != null, "selected_region not null");
    assert(selected_region.end != null, "selected_region.end not null");

    const startX = Math.min(
        selected_region.anchor.gridX,
        newX,
    );
    const startY = Math.min(
        selected_region.anchor.gridY,
        newY,
    );
    const endX = Math.max(
        selected_region.anchor.gridX,
        newX,
    );
    const endY = Math.max(
        selected_region.anchor.gridY,
        newY,
    );

    selected_region.start.gridX = startX;
    selected_region.start.gridY = startY;
    selected_region.end.gridX = endX;
    selected_region.end.gridY = endY;

    assert(selection_region_is_normalized(), "selection region is normalized");

    // if (endX <= selected_region.start.gridX) {
    //     selected_region.start.gridX = endX;
    // } else {
    //     selected_region.end.gridX = endX;
    // }
    // if (endY <= selected_region.start.gridY) {
    //     selected_region.start.gridY = endY;
    // } else {
    //     selected_region.end.gridY = endY;
    // }
}

function selection_update() {
    if (selected_region == null) {
        return;
    }
    // assert(
    //     selection_region_is_normalized(),
    //     "selection region is normalized",
    //     selected_region,
    // );

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region//_normalized();

    selection.style.transform = `translate(${startX * gridCellPx}px, ${startY * gridCellPx}px)`;
    selection.style.width = Math.abs(endX - startX) * gridCellPx + "px";
    selection.style.height = Math.abs(endY - startY) * gridCellPx + "px";
}

function selected_seat_refs_get() {
    return selection.querySelectorAll(`[data-${SEAT_DATA_IDENTIFIER}]`);
}

function selection_clear() {
    console.log("selection clear");
    const selected_seats = selected_seat_refs_get();
    if (selected_region == null) {
        assert(
            selected_seats.length == 0,
            "no selection -> no seats",
            selected_seats,
        );
        assert(
            is_creating_selection == false,
            "no selection -> not creating",
            is_creating_selection,
        );
        assert(
            selection.style.display === "none",
            "no selection -> style is hidden",
            selection.style.display,
        );
        return;
    }
    for (const seat of selected_seats) {
        seat.remove();
        container.appendChild(seat);
        delete seat.dataset.selected;
        seat_transform_revert_to_abs_loc(seat);
        seat.draggable = true;
    }
    selection.style.display = "none";
    selected_region = null;
    is_creating_selection = false;
}

container.onmousedown = function (event) {
    console.log("mouse down", event.composedPath());
    {
        // ensure not clicking something besides container
        const path = event.composedPath();
        if (path.at(0)?.id !== container.id) {
            return;
        }
    }

    if (selected_region != null) {
        selection_clear();
    }

    const gridX = Math.floor(
        (event.clientX - containerDomRect.left) / gridCellPx,
    );
    const gridY = Math.floor(
        (event.clientY - containerDomRect.top) / gridCellPx,
    );
    selected_region = {
        start: { gridX, gridY },
        end: { gridX: gridX + 1, gridY: gridY + 1 },
        anchor: { gridX, gridY },
    };
    selection.style.display = "block";
    selection_update();
    is_creating_selection = true;
};

container.onmousemove = function (event) {
    if (!is_creating_selection || selected_region == null) {
        // selection_clear();
        return;
    }
    console.log("mouse move");

    const gridX = Math.round(
        (event.clientX - containerDomRect.left) / gridCellPx,
    );
    const gridY = Math.round(
        (event.clientY - containerDomRect.top) / gridCellPx,
    );
    console.log(`end = [${gridX}, ${gridY}]`);
    // selected_region.end = { gridX, gridY };
    selected_region_end_set(gridX, gridY);
    // selection_region_normalize();

    selection_update();
};

container.onmouseup = function (event) {
    if (!is_creating_selection || selected_region == null) {
        selection_clear();
        return;
    }
    console.log("mouse up");

    const gridX = Math.round(
        (event.clientX - containerDomRect.left) / gridCellPx,
    );
    const gridY = Math.round(
        (event.clientY - containerDomRect.top) / gridCellPx,
    );
    // selected_region.end = { gridX, gridY };
    selected_region_end_set(gridX, gridY);
    // selection_region_normalize();

    const selected_seats = selected_seats_compute();

    if (selected_seats.length == 0) {
        console.log("empty selection");
        selection_clear();
        return;
    }

    selection_update();
    selected_seats_update(selected_seats);
    is_creating_selection = false;
};

// PERF: use IntersectionObserver instead of manual calculation
function selected_seats_compute() {
    assert(selected_region != null);
    console.log({ selected_region });
    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region//_normalized();

    if (Math.abs(endX - startX) < 1 || Math.abs(endY - startY) < 1) {
        return [];
    }

    const selected_seats = new Array();

    for (let i = 0; i < seat_locs.length; i++) {
        const seat_loc = seat_locs[i];
        if (seat_loc == null) {
            continue;
        }
        const seat_left = seat_loc.gridX;
        const seat_top = seat_loc.gridY;
        const seat_right = seat_loc.gridX + SEAT_GRID_W - 1;
        const seat_bottom = seat_loc.gridY + SEAT_GRID_H - 1;

        const corners = [
            [seat_left, seat_top],
            [seat_right, seat_top],
            [seat_left, seat_bottom],
            [seat_right, seat_bottom],
        ];

        let is_in_selection = false;
        for (let i = 0; i < corners.length && !is_in_selection; i++) {
            const [seatX, seatY] = corners[i];
            is_in_selection ||=
                startX <= seatX &&
                startY <= seatY &&
                endX >= seatX &&
                endY >= seatY;
        }
        if (is_in_selection) {
            const seatSelectionOffset = {
                gridX: seat_loc.gridX - startX,
                gridY: seat_loc.gridY - startY,
            };
            selected_seats[i] = seatSelectionOffset;
        }
    }

    return selected_seats;
}

function selected_seats_update(selected_seats) {
    for (let i = 0; i < seat_refs.length; i++) {
        const seat = seat_refs[i];
        const selected_offset = selected_seats[i];
        if (selected_offset == null) {
            if ("selected" in seat.dataset) delete seat.dataset.selected;
            if (seat.parentNode == selection) {
                seat.remove();
                container.appendChild(seat);
            }
            seat.draggable = true;
        } else {
            // seat.dataset.selected = "";
            // seat.style.transform = `translate(${selected_offset.gridX * gridCellPx}px, ${selected_offset.gridY * gridCellPx}px)`;
            seat_transform_set(
                seat,
                selected_offset.gridX,
                selected_offset.gridY,
            );
            selection.appendChild(seat);
            seat.draggable = false;
        }
    }
}

function closest_non_overlapping_pos(dragging_index, gridX, gridY) {
    function isValidPosition(gridX, gridY) {
        let is_not_overlapping = true;
        if (gridX < 0 || gridX > gridW - SEAT_GRID_W) return false;
        if (gridY < 0 || gridY > gridH - SEAT_GRID_H) return false;
        for (let i = 0; i < seat_locs.length && is_not_overlapping; i++) {
            if (i === dragging_index) continue; // Skip the actively dragging seat

            const seat_loc = seat_locs[i];
            if (seat_loc == null) continue;

            const is_overlapping =
                Math.abs(gridX - seat_loc.gridX) < SEAT_GRID_W &&
                Math.abs(gridY - seat_loc.gridY) < SEAT_GRID_H;

            is_not_overlapping = !is_overlapping;
        }
        return is_not_overlapping;
    }

    if (isValidPosition(gridX, gridY)) return { gridX, gridY };

    const directions = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
    ];

    let distance = 1;
    while (distance < Math.max(gridW, gridH)) {
        for (const [dx, dy] of directions) {
            const newX = gridX + dx * distance;
            const newY = gridY + dy * distance;
            if (isValidPosition(newX, newY)) {
                return { gridX: newX, gridY: newY };
            }
        }
        distance++;
    }
    throw new Error("No valid position found");
}

const SEAT_PROP_GRID_X = "--grid-x";
const SEAT_PROP_GRID_Y = "--grid-y";

/**
 * Set the transform on the seat
 * Same as abs_loc if not selected, when selected the transform is
 * relative to the start of the selection
 */
function seat_transform_set(seat_ref, gridX, gridY) {
    seat_ref.style.transform = SEAT_TRANSFORM;
    seat_ref.style.setProperty(SEAT_PROP_GRID_X, gridX);
    seat_ref.style.setProperty(SEAT_PROP_GRID_Y, gridY);
}

/**
 * Get the transform of the seat
 * Same as abs_loc if not selected, when selected the transform is
 * relative to the start of the selection
 */
function seat_transform_get(seat_ref) {
    const x = Number.parseInt(
        seat_ref.style.getPropertyValue(SEAT_PROP_GRID_X),
    );
    const y = Number.parseInt(
        seat_ref.style.getPropertyValue(SEAT_PROP_GRID_Y),
    );

    assert(Number.isSafeInteger(x), "x is int", x);
    assert(Number.isSafeInteger(y), "y is int", y);
    return [x, y];
}

/**
 * Set the transform on the seat to the seats abs_loc
 * Used to restore seat position after failed move or when deselecting
 */
function seat_transform_revert_to_abs_loc(seat_ref) {
    const [absX, absY] = seat_abs_loc_get(seat_ref);
    seat_transform_set(seat_ref, absX, absY);
}

/**
 * Get the absolute location of the seat, regardless of selection status.
 * Will not effect the transform (visual location)
 * used for storage only
 */
function seat_abs_loc_set(seat_ref, gridX, gridY) {
    seat_ref.dataset.x = gridX;
    seat_ref.dataset.y = gridY;

    // PERF: come up with a better way to get this, maybe have a map of seat refs to indices
    const seat_index = seat_refs.indexOf(seat_ref);
    assert(seat_index != -1, "seat_index not -1", seat_index);

    if (seat_locs[seat_index] != null) {
        seat_locs[seat_index].gridX = gridX;
        seat_locs[seat_index].gridY = gridY;
    } else {
        seat_locs[seat_index] = { gridX, gridY };
    }
}

/**
 * Get the absolute location of the seat, regardless of selection status.
 * used for storage only
 */
function seat_abs_loc_get(seat_ref) {
    assert(seat_ref instanceof Element, "seat_ref is element", seat_ref);
    const gridX = Number.parseInt(seat_ref.dataset.x);
    const gridY = Number.parseInt(seat_ref.dataset.y);
    assert(Number.isSafeInteger(gridX), "gridX is int", gridX);
    assert(Number.isSafeInteger(gridY), "gridY is int", gridY);
    return [gridX, gridY];
}

/**
 * Set the transform and abs_loc on the seat
 */
function seat_loc_set(seat_ref, gridX, gridY) {

    assert(seat_ref instanceof Element, "seat_ref is element", seat_ref);

    assert(Number.isSafeInteger(gridX), "gridX is number", gridX);
    assert(Number.isSafeInteger(gridY), "gridY is number", gridY);

    assert(gridX >= 0 && gridX < gridW, "gridX is valid", gridX);
    assert(gridY >= 0 && gridY < gridH, "gridY is valid", gridY);

    seat_transform_set(seat_ref, gridX, gridY);

    seat_abs_loc_set(seat_ref, gridX, gridY);

}

function seat_create() {
    const id = next_draggable_id++;
    const element = document.createElement("div");
    const elementClassName =
        "bg-indigo-400 border-2 border-indigo-500 text-center text-xl font-bold absolute data-[selected]:ring-2 data-[selected]:ring-blue-500";
    element.className = elementClassName;
    element.id = SEAT_ID_PREFIX + id;
    element.innerText = id.toString();
    element.draggable = true;
    element.style.width = SEAT_GRID_W * gridCellPx + "px";
    element.style.height = SEAT_GRID_H * gridCellPx + "px";
    element.dataset[SEAT_DATA_IDENTIFIER] = "";
    seat_refs.push(element);
    seat_loc_set(element, 0, 0);

    element.ondragstart = function (event) {
        console.log("DRAG SEAT START", element.dataset);
        if ("selected" in element.dataset) {
            console.log("dragging selected seat");
            return;
        }

        selection_clear();

        event.dataTransfer.setData("text/plain", id);
        event.dataTransfer.setData(
            DRAG_DATA_TYPE_KIND,
            DRAG_DATA_TYPE_KIND_SEAT,
        );
        elem_drag_offset_set(event.target, event.clientX, event.clientY);
        // seat_gridloc_save(event.target);
        event.dataTransfer.setDragImage(invisible_drag_preview, 0, 0);

        {
            // create drag preview
            const preview = document.createElement("div");
            preview.className =
                "bg-blue-300 border-2 border-blue-500 text-center text-xl font-bold absolute";
            preview.style.width = SEAT_GRID_W * gridCellPx + "px";
            preview.style.height = SEAT_GRID_H * gridCellPx + "px";
            preview.style.transition = "transform 0.06s ease-out";
            const [seatGridX, seatGridY] = seat_transform_get(element);
            seat_transform_set(preview, seatGridX, seatGridY);
            preview.id = "drag-preview";
            container.appendChild(preview);
        }

        element.style.zIndex = 999;
    };

    element.ondrag = function (event) {
        assert(containerDomRect != null, "containerDomRect not null");

        const [offsetX, offsetY] = elem_drag_offset_get(event.target);

        const x = event.clientX - containerDomRect.left - offsetX;
        const y = event.clientY - containerDomRect.top - offsetY;

        element.style.transform = `translate(${x}px, ${y}px)`;

        const gridX = Math.round(x / gridCellPx);
        const gridY = Math.round(y / gridCellPx);
        const snapped_loc = closest_non_overlapping_pos(id, gridX, gridY);

        {
            const preview = document.getElementById("drag-preview");
            seat_transform_set(preview, snapped_loc.gridX, snapped_loc.gridY);
            assert(preview != null, "preview not null");
            // preview.style.transform = `translate(${snapped_loc.gridX * gridCellPx}px, ${snapped_loc.gridY * gridCellPx}px)`;
        }
    };

    element.ondragend = function (event) {
        if (event.dataTransfer.dropEffect !== "none") {
            // drop succeeded
            return;
        }
        // drop failed

        // note following can be extracted to it's own function
        // apply_onetime_transition(el, transition)
        const transition = "transform 0.3s ease-out";
        element.style.transition = transition;
        element.ontransitionend = () => {
            if (element.style.transition === transition) {
                element.style.transition = "";
            }
        };
        seat_transform_revert_to_abs_loc(element);
        // const abs_loc = seat_abs_loc_get(element);
    };

    return element;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(n, max));
}

function elem_drag_offset_set(elem, clientX, clientY) {
    assert(containerDomRect != null, "containerDomRect not null");
    assert(elem != null, "elem not null");
    assert(Number.isSafeInteger(clientX), "clientX is int", clientY);
    assert(Number.isSafeInteger(clientY), "clientY is int", clientY);

    const rect = elem.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    elem.dataset.offsetx = offsetX;
    elem.dataset.offsety = offsetY;
}

function elem_drag_offset_get(elem) {
    assert(elem != null, "elem not null");
    const offsetX = Number.parseInt(elem.dataset.offsetx);
    const offsetY = Number.parseInt(elem.dataset.offsety);
    assert(
        Number.isSafeInteger(offsetX),
        "offsetX is integer",
        offsetX,
        elem.dataset.offsetx,
    );
    assert(
        Number.isSafeInteger(offsetY),
        "offsetY is integer",
        offsetY,
        elem.dataset.offsety,
    );
    return [offsetX, offsetY];
}

function container_handle_drop_seat(event) {
    event.preventDefault();
    const idStr = event.dataTransfer.getData("text/plain");
    const id = Number.parseInt(idStr);
    assert(Number.isSafeInteger(id), "id is integer", `'${idStr}'`, id);
    console.log("ON DROP", id);
    assert(containerDomRect != null, "containerDomRect not null");

    const element = seat_refs[id];
    assert(element != null, "element not null");

    const preview = document.getElementById("drag-preview");
    assert(preview != null, "preview not null");

    const [gridX, gridY] = seat_transform_get(preview);

    seat_loc_set(element, gridX, gridY);

    element.style.zIndex = 0;

    container.appendChild(element);

    preview.remove();
}

function container_handle_drop_selection(event) {
    event.preventDefault();

    assert(containerDomRect != null, "containerDomRect not null");

    const [offsetX, offsetY] = elem_drag_offset_get(event.target);

    const gridX = clamp(
        Math.round(
            (event.clientX - containerDomRect.left - offsetX) / gridCellPx,
        ),
        0,
        gridW,
    );
    const gridY = clamp(
        Math.round(
            (event.clientY - containerDomRect.top - offsetY) / gridCellPx,
        ),
        0,
        gridH,
    );

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region;

    const width = endX - startX;
    const height = endY - startY;

    selected_region.start.gridX = gridX;
    selected_region.start.gridY = gridY;
    selected_region.end.gridX = gridX + width;
    selected_region.end.gridY = gridY + height;

    selection_update();

    for (const seat of selected_seat_refs_get()) {
        const [seatX, seatY] = seat_transform_get(seat);
        seat_abs_loc_set(seat, gridX + seatX, gridY + seatY);
    }

    console.log("ON DROP SELECTION");
}

container.ondrop = function (event) {
    const kind = event.dataTransfer.getData(DRAG_DATA_TYPE_KIND);
    switch (kind) {
        case DRAG_DATA_TYPE_KIND_SEAT:
            container_handle_drop_seat(event);
            break;
        case DRAG_DATA_TYPE_KIND_SELECTION:
            container_handle_drop_selection(event);
            break;
        case "":
        default:
            console.warn("unknown drop kind:", `'${kind}'`);
            return;
    }
    // event.dataTransfer.clearData();
};

app.appendChild(container);
containerDomRect = container.getBoundingClientRect();

for (let i = 0; i < 10; i++) {
    container.appendChild(seat_create());
}
