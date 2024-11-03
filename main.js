import "./style.css";


// grid
const gridW = 60;
const gridH = 30;
const gridCellPx = Math.floor((0.8 * window.innerWidth) / gridW);

const GRID_PROP_W = "--grid-w";
const GRID_PROP_H = "--grid-h";

// seats
const SEAT_GRID_W = 4;
const SEAT_GRID_H = 4;

const SEAT_PROP_GRID_W = "--seat-grid-w";
const SEAT_PROP_GRID_H = "--seat-grid-h";

const SEAT_PROP_GRID_X = "--grid-x";
const SEAT_PROP_GRID_Y = "--grid-y";

const SEAT_TRANSFORM =
    "translate(calc(var(--grid-cell-px) * var(--grid-x)), calc(var(--grid-cell-px) * var(--grid-y)))";
const SEAT_DATA_IDENTIFIER = "seat";
const SEAT_ID_PREFIX = "drag-";

let next_seat_id = 0;
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
const DRAG_DATA_TYPE_KIND_STUDENT = "student";

// student
const STUDENT_DATA_SEAT_INDEX = "seatindex";

// zoom
const ZOOM_BTN_SCALE_FACTOR = 0.1
const ZOOM_DISPLAY_ID = "zoom-display"

function assert(val, ...msg) {
    if (val) return;
    console.error("Assertion failed: ", ...msg);
    throw new Error("Assertion failed: " + msg?.map(String).join(" ") ?? "");
}

Number.isSafeFloat = function (val) {
    return Number.isFinite(val) && !Number.isNaN(val)
}


function grid_cell_px_dim(v) {
    return `calc(var(--grid-cell-px) * var(${v}))`;
}

const app = document.getElementById("app");
assert(app != null, "app not null");

const invisible_drag_preview = document.createElement("span");
invisible_drag_preview.style.display = "none";
app.appendChild(invisible_drag_preview);

const container = document.getElementById("container");
assert(container != null, "container not null");
container.className = "relative bg-white";
container.style.setProperty("--grid-cell-px", gridCellPx + "px");
container.style.setProperty(SEAT_PROP_GRID_W, SEAT_GRID_W);
container.style.setProperty(SEAT_PROP_GRID_H, SEAT_GRID_H);
container.style.setProperty(GRID_PROP_W, gridW);
container.style.setProperty(GRID_PROP_H, gridH);
container.style.width = grid_cell_px_dim(GRID_PROP_W);
container.style.height = grid_cell_px_dim(GRID_PROP_H);

container.ondragover = function (event) {
    event.preventDefault();
};

container.style.backgroundImage = `
    linear-gradient(to right, #e5e5e5 1px, transparent 1px),
    linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
`;

container.style.backgroundSize = `var(--grid-cell-px) var(--grid-cell-px)`;

const CONTAINER_PROP_SCALE = '--scale'

function grid_cell_px_adjust(factor) {
    const current_scale = Number.parseFloat(container.style.getPropertyValue(CONTAINER_PROP_SCALE) || "1")

    assert(Number.isSafeFloat(current_scale), "current_scale is safe float", current_scale);

    const desired_scale = current_scale + factor

    const scale_transform = desired_scale / current_scale

    const current_value = Number.parseFloat(container.style.getPropertyValue('--grid-cell-px').slice(0, -"px".length))

    assert(Number.isSafeFloat(current_value), "grid cell px is valid float", current_value)

    const new_value = current_value * scale_transform;
    console.log({new_value, current_value, scale_transform})

    container.style.setProperty("--grid-cell-px", new_value + 'px')

    zoom_display_update(desired_scale)

    container.style.setProperty(CONTAINER_PROP_SCALE, desired_scale)
}

/**
 * @param {number} scale
 */
function zoom_display_update(scale) {
    document.getElementById(ZOOM_DISPLAY_ID).innerText = (scale * 100).toFixed(0) + "%"
}

function zoom_controls_init() {
    const ZOOM_ID__IN = "zoom-in"
    const ZOOM_ID_OUT = "zoom-out"


    const zoom_btn__in = document.getElementById(ZOOM_ID__IN)
    const zoom_btn_out = document.getElementById(ZOOM_ID_OUT)

    zoom_btn__in.addEventListener("click", function () {
        grid_cell_px_adjust(+ZOOM_BTN_SCALE_FACTOR)
    })
    zoom_btn_out.addEventListener('click', function () {
        grid_cell_px_adjust(-ZOOM_BTN_SCALE_FACTOR)
    })
}



const seat_preview = document.createElement("div");
seat_preview.id = "seat-preview";
seat_preview.className = "absolute bg-blue-300 border-2 border-indigo-500";
seat_preview.style.display = "none";
seat_preview.style.width = grid_cell_px_dim(SEAT_PROP_GRID_W);
seat_preview.style.height = grid_cell_px_dim(SEAT_PROP_GRID_H);
container.appendChild(seat_preview);

function preview_show(gridX, gridY) {
    seat_transform_set(seat_preview, gridX, gridY);
    seat_preview.style.display = "block";
}

function preview_hide() {
    seat_preview.style.display = "none";
}

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
};

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

function selected_region_end_set(newX, newY) {
    assert(selected_region != null, "selected_region not null");
    assert(selected_region.end != null, "selected_region.end not null");

    const startX = Math.min(selected_region.anchor.gridX, newX);
    const startY = Math.min(selected_region.anchor.gridY, newY);
    const endX = Math.max(selected_region.anchor.gridX, newX);
    const endY = Math.max(selected_region.anchor.gridY, newY);

    selected_region.start.gridX = startX;
    selected_region.start.gridY = startY;
    selected_region.end.gridX = endX;
    selected_region.end.gridY = endY;

    assert(selection_region_is_normalized(), "selection region is normalized");
}

function selection_update() {
    if (selected_region == null) {
        return;
    }

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region;

    selection.style.transform = `translate(${startX * gridCellPx}px, ${
        startY * gridCellPx
    }px)`;
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
    selected_region_end_set(gridX, gridY);

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
    selected_region_end_set(gridX, gridY);

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
    } = selected_region;

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
    // console.time("closest_non_overlapping_pos");
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

    if (isValidPosition(gridX, gridY)) {
        // console.timeEnd("closest_non_overlapping_pos");
        return { gridX, gridY };
    }

    // NOTE: In order to make snap feel less erratic
    // could track moment vector of dragging seat
    // and sort directions by min angle between the dir and moment vectors
    // OR just walk along moment vector

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
                // console.timeEnd("closest_non_overlapping_pos");
                return { gridX: newX, gridY: newY };
            }
        }
        distance++;
    }
    throw new Error("No valid position found");
}

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

const SEAT_DATA_STUDENT_DROP_INDICATION = "studentdragover";

function seat_student_drop_indication_enable(seat_ref) {
    seat_ref.dataset[SEAT_DATA_STUDENT_DROP_INDICATION] = "";
}

function seat_student_drop_indication_disable(seat_ref) {
    if (SEAT_DATA_STUDENT_DROP_INDICATION in seat_ref.dataset) {
        delete seat_ref.dataset[SEAT_DATA_STUDENT_DROP_INDICATION];
    }
}

/**
 * @param {HTMLElement} seat_ref
 * @returns {HTMLElement | null}
 */
function seat_student_get(seat_ref) {
    const students = seat_ref.querySelectorAll("[data-student]");
    // FIXME: uncomment once swap implemented
    // assert(students.length <= 1, "no more than 1 student per seat", students)
    if (students.length === 0) {
        return null;
    }
    return students[0];
}

/**
 * @param {HTMLElement} seat_ref
 * @param {HTMLElement} student_ref
 */
function seat_student_set(seat_ref, student_ref) {
    student_ref.className = STUDENT_CLASSLIST_SEATING;
    seat_ref.appendChild(student_ref);
    const seat_index = seat_refs.indexOf(seat_ref);
    assert(seat_index != -1, "seat_ref is in seat_refs", seat_ref, seat_refs);
    student_ref.dataset[STUDENT_DATA_SEAT_INDEX] = seat_index;
}

/**
 * @param {HTMLElement} seat_ref
 * @returns {HTMLElement} student_ref
 */
function seat_student_pop(seat_ref) {
    const student = seat_student_get(seat_ref);
    if (student == null) {
        return null;
    }

    assert(
        STUDENT_DATA_SEAT_INDEX in student.dataset,
        "seat-index in student dataset",
        student.dataset,
    );

    delete student.dataset[STUDENT_DATA_SEAT_INDEX];
    return student;
}

/**
 * @param {HTMLElement} dest_seat_ref
 * @param {HTMLElement} student_ref
 */
function seat_student_transfer(dest_seat_ref, student_ref) {
    const student_in_seat_ref = seat_student_get(dest_seat_ref);

    const original_seat_ref = student_get_seat(student_ref);

    if (original_seat_ref === dest_seat_ref) {
        return;
    }

    if (original_seat_ref) {
        const original_student_ref = seat_student_pop(original_seat_ref);
        assert(
            original_student_ref == student_ref,
            "student in original seat and transferring student are the same student",
        );

        if (student_in_seat_ref) {
            // move student in dest to the incoming students original seat
            elem_animate_move_swap(
                student_in_seat_ref,
                () => {
                    const also_student_in_seat_ref =
                        seat_student_pop(dest_seat_ref);
                    assert(
                        also_student_in_seat_ref === student_in_seat_ref,
                        "student in seat did not change",
                        { also_student_in_seat_ref, student_in_seat_ref },
                    );
                    seat_student_set(original_seat_ref, student_in_seat_ref);
                },
                student_ref,
            );
        }
    } else if (student_in_seat_ref) {
        // move student in seat to sidebar if thats where incomming student
        // came from
        elem_animate_move(student_in_seat_ref, () =>
            student_make_unseated(student_in_seat_ref),
        );
    }

    seat_student_set(dest_seat_ref, student_ref);
}

function seat_create(gridX, gridY) {
    const id = next_seat_id++;
    const element = document.createElement("div");
    const elementClassName =
        "bg-indigo-400 border-2 border-indigo-500 text-center text-xl font-bold absolute data-[selected]:ring-2 data-[selected]:ring-blue-500 data-[studentdragover]:border-green-500 flex items-center justify-center";
    element.className = elementClassName;
    element.id = SEAT_ID_PREFIX + id;
    // element.innerText = id.toString();
    element.draggable = true;
    element.style.width = grid_cell_px_dim(SEAT_PROP_GRID_W);
    element.style.height = grid_cell_px_dim(SEAT_PROP_GRID_H);
    element.dataset[SEAT_DATA_IDENTIFIER] = "";
    seat_refs.push(element);
    const { gridX: snapX, gridY: snapY } = closest_non_overlapping_pos(
        id,
        gridX,
        gridY,
    );
    seat_loc_set(element, snapX, snapY);

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
            const [seatGridX, seatGridY] = seat_transform_get(element);
            preview_show(seatGridX, seatGridY);
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
            assert(seat_preview != null, "preview not null");
            seat_transform_set(
                seat_preview,
                snapped_loc.gridX,
                snapped_loc.gridY,
            );
            // preview.style.transform = `translate(${snapped_loc.gridX * gridCellPx}px, ${snapped_loc.gridY * gridCellPx}px)`;
        }
    };

    element.ondragend = function (event) {
        preview_hide();

        const seat = event.currentTarget;

        elem_drag_offset_clear(seat);
        if (event.dataTransfer.dropEffect !== "none") {
            // drop succeeded
            return;
        }
        // drop failed

        elem_apply_onetime_transition(
            event.currentTarget,
            "transform 0.3s ease-out",
        );
        seat_transform_revert_to_abs_loc(element);
        // const abs_loc = seat_abs_loc_get(element);
    };

    element.ondragover = function (event) {
        if (
            event.dataTransfer.getData(DRAG_DATA_TYPE_KIND) !==
            DRAG_DATA_TYPE_KIND_STUDENT
        ) {
            return;
        }

        e.preventDefault();
        // e.stopPropagation()
    };

    element.ondragenter = function (event) {
        if (!event.dataTransfer.types.includes("deskribe/student")) {
            return;
        }

        seat_student_drop_indication_enable(event.target);
    };

    element.ondragleave = function (event) {
        if (!event.dataTransfer.types.includes("deskribe/student")) {
            return;
        }

        const seat_student = seat_student_get(event.currentTarget);
        if (
            (seat_student && event.composedPath().includes(seat_student)) ||
            event.relatedTarget === seat_student
        ) {
            return;
        }

        seat_student_drop_indication_disable(event.currentTarget);
    };

    element.ondrop = function (event) {
        const seat_ref = event.currentTarget;

        if (
            event.dataTransfer.getData(DRAG_DATA_TYPE_KIND) !==
            DRAG_DATA_TYPE_KIND_STUDENT
        ) {
            return;
        }

        const student_index = Number.parseInt(
            event.dataTransfer.getData("text/plain"),
        );

        assert(
            Number.isSafeInteger(student_index),
            "student index exists on student on drop",
            event.dataTransfer,
        );

        const student_ref = students[student_index];
        seat_student_transfer(seat_ref, student_ref);

        event.stopPropagation();

        seat_student_drop_indication_disable(seat_ref);
    };

    return element;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(n, max));
}

/**
 * @param {HTMLElement} elem
 * @param {string} transition
 */
function elem_apply_onetime_transition(elem, transition) {
    let had_transition = false;
    if (elem.style.transition) {
        had_transition = true;
        elem.style.setProperty("--prev-transition", elem.style.transition);
    }
    elem.style.transition = transition;

    elem.addEventListener("transitionend", function cleanUp() {
        if (elem.style.transition !== transition) {
            return;
        }
        const prev = elem.style.getPropertyValue("--prev-transition");
        if (prev) {
            assert(
                had_transition,
                "if prev then there shouldv'e been a transition",
            );
            elem.style.transition = prev;
        } else {
            assert(
                !had_transition,
                "if no prev then there shouldn't have been transition",
            );
            delete elem.style.transition;
        }
        element.removeEventListener("transitionend", cleanUp);
    });
}

/**
 * @param {HTMLElement} element
 * @param {() => void} move
 * @param {HTMLElement} swapping_with
 */
function elem_animate_move_swap(element, move, swapping_with) {
    // get swapping_with rect first so that the {top,left} values
    // are not effected by the element getting moved
    const final_elem_rect = swapping_with.getBoundingClientRect();

    // debugger
    // Step 1: Get the initial position
    const initialRect = element.getBoundingClientRect();

    // PERF: store elevated container in dom (hidden) instead
    // of recreating on each animated move
    const elevated_container = document.createElement("div");
    elevated_container.style.zIndex = 999;
    elevated_container.style.position = "absolute";
    elevated_container.className = "w-full h-full";
    elevated_container.style.top = 0;
    elevated_container.style.left = 0;
    const elevated_container_inner = document.createElement("div");
    elevated_container_inner.style.position = "relative";
    elevated_container_inner.className = "w-full h-full";
    elevated_container.appendChild(elevated_container_inner);
    document.body.appendChild(elevated_container);

    // Step 2: Move the element to the new container
    move();

    // Step 3: Calculate the difference

    // FIXME: adjust final_rect_{x,y} by difference between
    // element and swapping_with elements bounding boxes
    // to account for possible difference in size between the
    // two elements
    let final_rect_x = final_elem_rect.left;
    let final_rect_y = final_elem_rect.top;

    const deltaX = initialRect.left - final_rect_x;
    const deltaY = initialRect.top - final_rect_y;

    const final_parent = element.parentElement;
    const final_next_sibling = element.nextElementSibling;

    const element_prev_position = element.style.position;
    element.style.position = "absolute";
    element.style.top = initialRect.top - deltaY + "px";
    element.style.left = initialRect.left - deltaX + "px";
    elevated_container_inner.appendChild(element);

    // Step 4: Apply the inverse transform
    assert(!element.style.transform, "overwriting transform");
    element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    element.style.transition = "transform 0s";

    // Force a repaint
    element.offsetWidth;

    const distance = Math.sqrt(
        Math.pow(final_rect_x - initialRect.left, 2) +
            Math.pow(final_rect_y - initialRect.top, 2),
    );

    const duration = distance / 300;

    // Step 5: Remove the transform with a transition
    element.style.transform = "";
    element.style.transition = `transform ${duration}s`;

    // Optional: Clean up styles after animation
    element.addEventListener("transitionend", function cleanUp() {
        element.style.transition = "";
        element.style.position = element_prev_position;
        delete element.style.top;
        delete element.style.left;
        element.removeEventListener("transitionend", cleanUp);

        if (final_next_sibling) {
            final_next_sibling.insertBefore(element);
        } else {
            final_parent.appendChild(element);
        }
        document.body.removeChild(elevated_container);
    });
}
/**
 * @param {HTMLElement} element
 * @param {() => void} move
 */
function elem_animate_move(element, move, center = false) {
    // debugger
    // Step 1: Get the initial position
    const initialRect = element.getBoundingClientRect();

    const elevated_container = document.createElement("div");
    elevated_container.style.zIndex = 999;
    elevated_container.style.position = "absolute";
    elevated_container.className = "w-full h-full";
    elevated_container.style.top = 0;
    elevated_container.style.left = 0;
    const elevated_container_inner = document.createElement("div");
    elevated_container_inner.style.position = "relative";
    elevated_container_inner.className = "w-full h-full";
    elevated_container.appendChild(elevated_container_inner);
    document.body.appendChild(elevated_container);

    // Step 2: Move the element to the new container
    move();

    // Step 3: Calculate the difference

    const final_elem_rect = element.getBoundingClientRect();

    let final_rect_x;
    let final_rect_y;
    if (center) {
        const final_parent_rect = element.parentElement.getBoundingClientRect();
        const parent_mid_x =
            final_parent_rect.left + final_parent_rect.width / 2;
        const parent_mid_y =
            final_parent_rect.top + final_parent_rect.height / 2;
        final_rect_x = parent_mid_x - final_elem_rect.width / 2;
        final_rect_y = parent_mid_y - final_elem_rect.height / 2;
    } else {
        final_rect_x = final_elem_rect.left;
        final_rect_y = final_elem_rect.top;
    }
    const deltaX = initialRect.left - final_rect_x;
    const deltaY = initialRect.top - final_rect_y;

    const final_parent = element.parentElement;
    const final_next_sibling = element.nextElementSibling;

    const element_prev_position = element.style.position;
    element.style.position = "absolute";
    element.style.top = initialRect.top - deltaY + "px";
    element.style.left = initialRect.left - deltaX + "px";
    elevated_container_inner.appendChild(element);

    // Step 4: Apply the inverse transform
    assert(!element.style.transform, "overwriting transform");
    element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    element.style.transition = "transform 0s";

    // Force a repaint
    element.offsetWidth;

    const distance = Math.sqrt(
        Math.pow(final_rect_x - initialRect.left, 2) +
            Math.pow(final_rect_y - initialRect.top, 2),
    );

    const duration = distance / 300;

    // Step 5: Remove the transform with a transition
    element.style.transform = "";
    element.style.transition = `transform ${duration}s`;

    // Optional: Clean up styles after animation
    element.addEventListener("transitionend", function cleanUp() {
        element.style.transition = "";
        element.style.position = element_prev_position;
        delete element.style.top;
        delete element.style.left;
        element.removeEventListener("transitionend", cleanUp);

        if (final_next_sibling) {
            final_next_sibling.insertBefore(element);
        } else {
            final_parent.appendChild(element);
        }
        document.body.removeChild(elevated_container);
    });
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

function elem_drag_offset_clear(elem) {
    assert(elem != null, "elem not null")
    assert('dataset' in elem, "elem is element with dataset property")

    delete elem.dataset.offsetx
    delete elem.dataset.offsety
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

    assert(seat_preview != null, "preview not null");

    const [gridX, gridY] = seat_transform_get(seat_preview);

    seat_loc_set(element, gridX, gridY);

    element.style.zIndex = 0;

    container.appendChild(element);

    seat_preview.style.display = "none";
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
};

/**
 * make an element invisible without unmounting from dom to preserve
 * drag. Attempts to save style properties that may or may not exist already
 * @param {HTMLElement} elem
 */
function elem_make_invisible(elem) {
    if (elem.dataset["invisible"]) {
        return;
    }
    function store_and_clear_style(name, clear_value) {
        const prev_value_name = "--prev-visible-" + name;
        const value = elem.style.getPropertyValue(name);

        if (value) {
            elem.style.setProperty(prev_value_name, value);
        }

        if (clear_value) {
            elem.style.setProperty(name, clear_value);
        } else {
            elem.style.removeProperty(name);
        }
    }

    elem.dataset["invisible"] = "true";

    store_and_clear_style("background-image");
    store_and_clear_style("background-color", "transparent");
    store_and_clear_style("color", "transparent");
    store_and_clear_style("box-shadow", "0px 0px 0px rgba(0, 0, 0, 0)");
    store_and_clear_style("border-color", "transparent");
}

function elem_make_visible(elem) {
    function restore_style(name) {
        const prev_value_name = "--prev-visible-" + name;
        const prev_value = elem.style.getPropertyValue(prev_value_name);
        if (prev_value) {
            elem.style.setProperty(name, prev_value);
            elem.style.removeProperty(prev_value_name);
        } else if (elem.style.getPropertyValue(name)) {
            elem.style.removeProperty(name);
        }
    }

    delete elem.dataset["invisible"];

    restore_style("background-image");
    restore_style("background-color");
    restore_style("color");
    restore_style("box-shadow");
    restore_style("border-color");
}

const students = [];

//////////////
// STUDENTS //
//////////////

const sidebar = document.getElementById("sidebar");
assert(sidebar != null, "sidebar not null");
const sidebar_student_input = sidebar.querySelector("#student-name-input");
const sidebar_student_add = sidebar.querySelector("#add-student-button");
const sidebar_student_list = sidebar.querySelector("#students");

const STUDENT_CLASSLIST_SIDEBAR =
    "ring-2 rounded-md w-40 h-8 flex items-center justify-center font-semibold text-xs bg-white text-black";

const STUDENT_CLASSLIST_SEATING =
    "border-2 border-black rounded-md w-min px-2 py-1 flex items-center justify-center font-semibold text-xs bg-white text-black break-normal";

function student_get_seat(student_ref) {
    const seat_index_str = student_ref.dataset[STUDENT_DATA_SEAT_INDEX];
    if (!seat_index_str) {
        return null;
    }
    const seat_index = Number.parseInt(seat_index_str);
    assert(
        Number.isSafeInteger(seat_index),
        "seat_index is safe integer",
        seat_index,
    );

    return seat_refs[seat_index];
}

function student_make_unseated(student_ref) {
    student_ref.className = STUDENT_CLASSLIST_SIDEBAR;
    sidebar_student_list.appendChild(student_ref);
    assert(
        STUDENT_DATA_SEAT_INDEX in student_ref.dataset,
        "student to be unseated must be in seat",
        student_ref,
    );
    delete student_ref.dataset[STUDENT_DATA_SEAT_INDEX];
}

function student_create(name) {
    const student = document.createElement("div");
    student.className = STUDENT_CLASSLIST_SIDEBAR;
    student.textContent = name;
    student.dataset["student"] = "";

    const student_index = students.length;
    students.push(student);

    student.draggable = true;

    student.ondragstart = function (event) {
        event.stopPropagation();

        const student_ref = event.currentTarget;

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
            DRAG_DATA_TYPE_KIND,
            DRAG_DATA_TYPE_KIND_STUDENT,
        );
        event.dataTransfer.setData("text/plain", student_index);
        event.dataTransfer.setData("deskribe/student", "");

        student_ref.style.zIndex = 50;
    };

    student.ondrag = function (event) {
        elem_make_invisible(event.target);
        event.stopPropagation();
    };

    student.ondragover = function (event) {
        event.preventDefault();
    };

    student.ondragend = function (event) {
        const student_ref = event.currentTarget;
        elem_make_visible(student_ref);
    };

    return student;
}

sidebar_student_add.onclick = () => {
    const name = sidebar_student_input.value;
    if (!name) return;
    sidebar_student_input.value = "";
    sidebar_student_list.appendChild(student_create(name));
    sidebar_student_input.focus();
};

containerDomRect = container.getBoundingClientRect();

const center_grid_x = Math.floor(gridW / 2);
const center_grid_y = Math.floor(gridH / 2);
for (let i = 0; i < 10; i++) {
    container.appendChild(seat_create(center_grid_x, center_grid_y));
}

function init() {
    zoom_controls_init()
}

init()
