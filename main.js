// vim: foldmethod=marker

import "./style.css";

const app = document.getElementById("app");
assert(app != null, "app not null");

// grid
const gridW_initial = 60;
const gridH_initial = 30;
const gridCellPx_initial = Math.floor(
    (0.8 * window.innerWidth) / gridW_initial,
);

const GRID_PROP_W = "--grid-w";
const GRID_PROP_H = "--grid-h";

const PROP_GRID_POS_X = "--grid-x";
const PROP_GRID_POS_Y = "--grid-y";

const GRID_POS_TRANSFORM =
    "translate(calc(var(--grid-cell-px) * var(--grid-x)), calc(var(--grid-cell-px) * var(--grid-y)))";

// seats
const SEAT_GRID_W = 4;
const SEAT_GRID_H = 4;

const SEAT_PROP_GRID_W = "--seat-grid-w";
const SEAT_PROP_GRID_H = "--seat-grid-h";

const SEAT_DATA_IDENTIFIER = "seat";
const SEAT_ID_PREFIX = "drag-";

const SEAT_DATA_STUDENT_DROP_INDICATION = "studentdragover";

let next_seat_id = 0;
let seat_refs = [];
// FIXME: remove - calculate on demand using `seat_abs_loc_get`
let seat_locs = [];

const seat_preview_ref = document.createElement("div");

// container
const CONTAINER_PROP_SCALE = "--scale";

/** @type {HTMLDivElement} */
const container_ref = document.getElementById("container");
assert(container_ref != null, "container not null");
let containerDomRect;

// selection
const SELECTION_PROP_WIDTH = "--width";
const SELECTION_PROP_HEIGHT = "--height";

const SELECTION_CLIPBOARD_DATA_TYPE = "deskribe/selection";
const selection_ref = document.createElement("div");
let is_creating_selection = false;
/** @type {{anchor: {gridX: number, gridY: number}, start: {gridX: number, gridY: number}, end: {gridX: number: gridY: number}} | undefined}*/
let selected_region;

// drag
const DRAG_DATA_TYPE_KIND = "application/kind";

const DRAG_DATA_TYPE_KIND_SEAT = "seat";
const DRAG_DATA_TYPE_KIND_SELECTION = "selection";
const DRAG_DATA_TYPE_KIND_STUDENT = "student";

const invisible_drag_preview = document.createElement("span");
{
    invisible_drag_preview.style.display = "none";
    app.appendChild(invisible_drag_preview);
}

// student
const STUDENT_DATA_SEAT_INDEX = "seatindex";
const student_refs = [];

// zoom
const ZOOM_BTN_SCALE_FACTOR = 0.1;
const ZOOM_DISPLAY_ID = "zoom-display";

// sidebar
const sidebar_ref = document.getElementById("sidebar");
assert(sidebar_ref != null, "sidebar not null");
const sidebar_student_list_ref = sidebar_ref.querySelector("#students");

const STUDENT_CLASSLIST_SIDEBAR =
    "ring-2 rounded-md w-40 h-8 flex items-center justify-center font-semibold text-xs bg-white text-black";

const STUDENT_CLASSLIST_SEATING =
    "border-2 border-black rounded-md w-min px-2 py-1 flex items-center justify-center font-semibold text-xs bg-white text-black break-normal";

function assert(val, ...msg) {
    if (val) return;
    console.error("Assertion failed: ", ...msg);
    throw new Error("Assertion failed: " + msg?.map(String).join(" ") ?? "");
}

Number.isSafeFloat = function (val) {
    return Number.isFinite(val) && !Number.isNaN(val);
};

function grid_cell_px_dim(v) {
    assert(v.startsWith("--"), "grid cell px dim must reference a variable");
    return `calc(var(--grid-cell-px) * var(${v}))`;
}

function grid_cell_px_get() {
    const gridCellPxStr =
        container_ref.style.getPropertyValue("--grid-cell-px");
    const gridCellPx = Number.parseFloat(gridCellPxStr.slice(0, -"px".length));

    assert(
        Number.isSafeFloat(
            gridCellPx,
            "gridCellPx is valid float",
            gridCellPx,
            gridCellPxStr,
        ),
    );

    return gridCellPx;
}

function grid_cell_px_adjust(factor) {
    const current_scale = Number.parseFloat(
        container_ref.style.getPropertyValue(CONTAINER_PROP_SCALE) || "1",
    );

    assert(
        Number.isSafeFloat(current_scale),
        "current_scale is safe float",
        current_scale,
    );

    const desired_scale = current_scale + factor;

    const scale_transform = desired_scale / current_scale;

    const current_value = grid_cell_px_get();

    const new_value = current_value * scale_transform;
    // console.log({ new_value, current_value, scale_transform });

    container_ref.style.setProperty("--grid-cell-px", new_value + "px");

    zoom_display_update(desired_scale);

    container_ref.style.setProperty(CONTAINER_PROP_SCALE, desired_scale);
}

function px_point_to_grid_round(gridCellPx, x, y) {
    assert(
        gridCellPx != null && x != null && y != null,
        "signature is (gridCellPx, x, y) got: (",
        [gridCellPx, x, y].join(", "),
        ")",
    );

    const gridX = Math.round(x / gridCellPx);
    const gridY = Math.round(y / gridCellPx);

    return [gridX, gridY];
}

function px_point_to_grid_floor(gridCellPx, x, y) {
    assert(
        gridCellPx != null && x != null && y != null,
        "signature is (gridCellPx, x, y) got: (",
        [gridCellPx, x, y].join(", "),
        ")",
    );

    const gridX = Math.floor(x / gridCellPx);
    const gridY = Math.floor(y / gridCellPx);

    return [gridX, gridY];
}

function px_point_to_grid_unsafe(gridCellPx, x, y) {
    const gridX = x / gridCellPx;
    const gridY = y / gridCellPx;

    return [gridX, gridY];
}

/**
 * @param {number} scale
 */
function zoom_display_update(scale) {
    document.getElementById(ZOOM_DISPLAY_ID).innerText =
        (scale * 100).toFixed(0) + "%";
}

function preview_show(gridX, gridY) {
    elem_grid_pos_set(seat_preview_ref, gridX, gridY);
    seat_preview_ref.style.display = "block";
}

function preview_hide() {
    seat_preview_ref.style.display = "none";
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

    selection_ref.style.display = "block"

    const {
        start: { gridX: startX, gridY: startY },
        end: { gridX: endX, gridY: endY },
    } = selected_region;

    elem_grid_pos_set(selection_ref, startX, startY);

    selection_dims_set(Math.abs(endX - startX), Math.abs(endY - startY));

    selection_ref.style.width = grid_cell_px_dim(SELECTION_PROP_WIDTH);
    selection_ref.style.height = grid_cell_px_dim(SELECTION_PROP_HEIGHT);
}

function selected_seat_refs_get() {
    return selection_ref.querySelectorAll(`[data-${SEAT_DATA_IDENTIFIER}]`);
}

function selection_force_appear_above_seats() {
    if (selection_ref.nextElementSibling == null) {
        return
    }
    container_ref.appendChild(selection_ref);
}

function selection_dims_set(width, height) {
    assert(Number.isSafeInteger(width));
    assert(Number.isSafeInteger(height));
    assert(width >= 0, width);
    assert(height >= 0, height);
    selection_ref.style.setProperty(SELECTION_PROP_WIDTH, width);
    selection_ref.style.setProperty(SELECTION_PROP_HEIGHT, height);
}

function selection_dims_get() {
    const width = Number.parseInt(
        selection_ref.style.getPropertyValue(SELECTION_PROP_WIDTH),
    );
    const height = Number.parseInt(
        selection_ref.style.getPropertyValue(SELECTION_PROP_HEIGHT),
    );

    assert(Number.isSafeInteger(width));
    assert(Number.isSafeInteger(height));
    assert(width > 0);
    assert(height > 0);

    return [width, height];
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
            selection_ref.style.display === "none",
            "no selection -> style is hidden",
            selection_ref.style.display,
        );
        return;
    }
    for (const seat of selected_seats) {
        seat.remove();
        container_ref.appendChild(seat);
        delete seat.dataset.selected;
        seat_grid_pos_revert_to_abs_loc(seat);
        seat.draggable = true;
    }
    selection_ref.style.display = "none";
    selected_region = null;
    is_creating_selection = false;
}

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

/**
 * @param {Array<{gridX: number, gridY: number} | null>} selected_seat_offsets
 */
function selected_seats_update(selected_seat_offsets) {
    for (let i = 0; i < seat_refs.length; i++) {
        const seat_ref = seat_refs[i];
        if (seat_ref == null) {
            continue;
        }
        const selected_offset = selected_seat_offsets[i];
        if (selected_offset == null && seat_is_selected(seat_ref)) {
            if ("selected" in seat_ref.dataset) {
                delete seat_ref.dataset.selected;
            }
            if (seat_ref.parentElement == selection_ref) {
                seat_ref.remove();
                container_ref.appendChild(seat_ref);
            }
            seat_ref.draggable = true;
        } else if (selected_offset != null && !seat_is_selected(seat_ref)) {
            seat_make_selected(
                seat_ref,
                selected_offset.gridX,
                selected_offset.gridY,
            );
        }
    }
}

function seat_make_selected(seat_ref, ofsX, ofsY) {
    elem_grid_pos_set(seat_ref, ofsX, ofsY);
    seat_ref.dataset["selected"] = "";
    selection_ref.appendChild(seat_ref);
    seat_ref.draggable = false;
}

function seat_is_selected(seat_ref) {
    if (seat_ref.parentElement === selection_ref) {
        assert(
            "selected" in seat_ref.dataset,
            "selected seat should have selected in dataset",
        );
        return true;
    }
    return false;
}

function* dbg_generate_rainbow_colors(max_colors = 360) {
    const hueStep = 360 / max_colors;

    for (let i = 0; i < max_colors; i++) {
        const hue = i * hueStep;
        yield `hsl(${hue}, 100%, 50%)`;
    }

    return null;
}

function dbg_render_dot_in_grid_square(color, gridX, gridY) {
    const dbg_dot = document.createElement("div");
    dbg_dot.style.backgroundColor = color;
    const gridCellPx = grid_cell_px_get();

    dbg_dot.style.position = "absolute";
    dbg_dot.style.top = 0;
    dbg_dot.style.left = 0;

    const size = Math.round(0.8 * gridCellPx);

    const x = gridCellPx * gridX + gridCellPx / 2 - size / 2;
    const y = gridCellPx * gridY + gridCellPx / 2 - size / 2;

    dbg_dot.style.transform = `translate(${x}px, ${y}px)`;
    dbg_dot.style.width = size + "px";
    dbg_dot.style.height = size + "px";
    dbg_dot.classList = "rounded-full";

    dbg_dot.dataset["dbgdot"] = "";
    container_ref.appendChild(dbg_dot);
}

function dbg_clear_all_dots() {
    const dots = document.querySelectorAll("[data-dbgdot]");
    for (const dot of dots) {
        dot.remove();
    }
}

function dbg_sleep(milliseconds) {
    console.warn("sleep", milliseconds);
    const start = Date.now();
    while (Date.now() - start < milliseconds) {
        // Do nothing, just wait
    }
}

function closest_non_overlapping_pos(dragging_index, absX, absY) {
    // console.time("closest non overlapping pos circ");

    function isValidPosition(gridX, gridY) {
        let is_not_overlapping = true;
        if (gridX < 0 || gridX > gridW_initial - SEAT_GRID_W) return false;
        if (gridY < 0 || gridY > gridH_initial - SEAT_GRID_H) return false;
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

    const gridCellPx = grid_cell_px_get();

    const [gridX, gridY] = px_point_to_grid_round(gridCellPx, absX, absY);

    if (isValidPosition(gridX, gridY)) {
        // console.timeEnd("closest non overlapping pos circ");
        return { gridX, gridY };
    }

    const [absGridX, absGridY] = px_point_to_grid_unsafe(
        gridCellPx,
        absX,
        absY,
    );
    const [centerX, centerY] = seat_center_exact(absGridX, absGridY);

    const max_radius = Math.min(gridW_initial, gridH_initial);

    for (let radius = 1; radius <= max_radius; radius++) {
        for (let angle = 0; angle < 360; angle++) {
            const x = Math.round(
                centerX +
                    radius * Math.cos((angle * Math.PI) / 180) -
                    SEAT_GRID_W / 2,
            );
            const y = Math.round(
                centerY +
                    radius * Math.sin((angle * Math.PI) / 180) -
                    SEAT_GRID_H / 2,
            );

            if (isValidPosition(x, y)) {
                // console.timeEnd("closest non overlapping pos circ");
                // console.log('angle', angle, 'radius', radius)
                return { gridX: x, gridY: y };
            }
        }
    }
    throw new Error("No valid position found");
}

/**
 * @returns {[centerX: number, centerY: number]} [centerX, centerY]
 */
function seat_center_exact(gridX, gridY) {
    return [gridX + SEAT_GRID_W / 2, gridY + SEAT_GRID_H / 2];
}

function calculate_distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

/**
 * Set the transform on the seat
 * Same as abs_loc if not selected, when selected the transform is
 * relative to the start of the selection
 */
function elem_grid_pos_set(seat_ref, gridX, gridY) {
    seat_ref.style.transform = GRID_POS_TRANSFORM;
    seat_ref.style.setProperty(PROP_GRID_POS_X, gridX);
    seat_ref.style.setProperty(PROP_GRID_POS_Y, gridY);
}

/**
 * Get the transform of the seat
 * Same as abs_loc if not selected, when selected the transform is
 * relative to the start of the selection
 */
function elem_grid_pos_get(seat_ref) {
    const x = Number.parseInt(seat_ref.style.getPropertyValue(PROP_GRID_POS_X));
    const y = Number.parseInt(seat_ref.style.getPropertyValue(PROP_GRID_POS_Y));

    assert(Number.isSafeInteger(x), "x is int", x);
    assert(Number.isSafeInteger(y), "y is int", y);
    return [x, y];
}

/**
 * Set the transform on the seat to the seats abs_loc
 * Used to restore seat position after failed move or when deselecting
 */
function seat_grid_pos_revert_to_abs_loc(seat_ref) {
    const [absX, absY] = seat_abs_loc_get(seat_ref);
    elem_grid_pos_set(seat_ref, absX, absY);
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

    assert(gridX >= 0 && gridX < gridW_initial, "gridX is valid", gridX);
    assert(gridY >= 0 && gridY < gridH_initial, "gridY is valid", gridY);

    elem_grid_pos_set(seat_ref, gridX, gridY);

    seat_abs_loc_set(seat_ref, gridX, gridY);
}

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

    const original_seat_ref = student_seat_get(student_ref);

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

    const gridCellPx = grid_cell_px_get();
    const { gridX: snapX, gridY: snapY } = closest_non_overlapping_pos(
        id,
        gridX * gridCellPx,
        gridY * gridCellPx,
    );
    seat_loc_set(element, snapX, snapY);

    element.ondragstart = function (event) {
        dbg_clear_all_dots();
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
            const [seatGridX, seatGridY] = elem_grid_pos_get(element);
            preview_show(seatGridX, seatGridY);
        }

        element.style.zIndex = 999;
    };

    element.ondrag = function (event) {
        containerDomRect = container_ref.getBoundingClientRect();
        assert(containerDomRect != null, "containerDomRect not null");

        const [offsetX, offsetY] = elem_drag_offset_get(event.target);

        const x =
            event.clientX -
            containerDomRect.left -
            offsetX +
            container_ref.scrollLeft;
        const y =
            event.clientY -
            containerDomRect.top -
            offsetY +
            container_ref.scrollTop;

        element.style.transform = `translate(${x}px, ${y}px)`;

        const snapped_loc = closest_non_overlapping_pos(id, x, y);
        {
            assert(seat_preview_ref != null, "preview not null");
            elem_grid_pos_set(
                seat_preview_ref,
                snapped_loc.gridX,
                snapped_loc.gridY,
            );
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
        seat_grid_pos_revert_to_abs_loc(element);
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

        const student_ref = student_refs[student_index];
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
 * @param {HTMLElement} elem_ref
 * @param {() => void} move
 * @param {HTMLElement} swapping_with_ref
 */
function elem_animate_move_swap(elem_ref, move, swapping_with_ref) {
    // get swapping_with rect first so that the {top,left} values
    // are not effected by the element getting moved
    const final_elem_rect = swapping_with_ref.getBoundingClientRect();

    // debugger
    // Step 1: Get the initial position & create elevated container
    //         so animation appears above everything else
    const initialRect = elem_ref.getBoundingClientRect();

    // PERF: store elevated container in dom (hidden) instead
    // of recreating on each animated move
    const elevated_container_ref = document.createElement("div");
    elevated_container_ref.style.zIndex = 999;
    elevated_container_ref.style.position = "absolute";
    elevated_container_ref.className = "w-full h-full";
    elevated_container_ref.style.top = 0;
    elevated_container_ref.style.left = 0;
    const elevated_container_inner_ref = document.createElement("div");
    elevated_container_inner_ref.style.position = "relative";
    elevated_container_inner_ref.className = "w-full h-full";
    elevated_container_ref.appendChild(elevated_container_inner_ref);
    document.body.appendChild(elevated_container_ref);

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

    const final_parent_ref = elem_ref.parentElement;
    const final_next_sibling_ref = elem_ref.nextElementSibling;

    const element_prev_position = elem_ref.style.position;
    elem_ref.style.position = "absolute";
    elem_ref.style.top = initialRect.top - deltaY + "px";
    elem_ref.style.left = initialRect.left - deltaX + "px";
    elevated_container_inner_ref.appendChild(elem_ref);

    // Step 4: Apply the inverse transform
    assert(!elem_ref.style.transform, "overwriting transform");
    elem_ref.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    elem_ref.style.transition = "transform 0s";

    // Force a repaint
    elem_ref.offsetWidth;

    const distance = Math.sqrt(
        Math.pow(final_rect_x - initialRect.left, 2) +
            Math.pow(final_rect_y - initialRect.top, 2),
    );

    const duration = distance / 1000;

    // Step 5: Remove the transform with a transition
    elem_ref.style.transform = "";
    elem_ref.style.transitionProperty = "transform";
    elem_ref.style.transitionDuration = duration + "s";
    elem_ref.style.transitionTimingFunction = "linear";

    // Optional: Clean up styles after animation
    elem_ref.addEventListener("transitionend", function cleanUp() {
        elem_ref.style.transition = "";
        elem_ref.style.position = element_prev_position;
        delete elem_ref.style.top;
        delete elem_ref.style.left;
        elem_ref.removeEventListener("transitionend", cleanUp);

        if (final_next_sibling_ref) {
            final_next_sibling_ref.insertBefore(elem_ref);
        } else {
            final_parent_ref.appendChild(elem_ref);
        }
        document.body.removeChild(elevated_container_ref);
    });
}
/**
 * @param {HTMLElement} element
 * @param {() => void} move
 * @param {boolean | undefined} center
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

    const distance = calculate_distance(
        final_rect_x,
        final_rect_y,
        initialRect.left,
        initialRect.top,
    );

    const duration = distance / 1000;

    // Step 5: Remove the transform with a transition
    element.style.transform = "";
    element.style.transitionProperty = "transform";
    element.style.transitionDuration = duration + "s";
    element.style.transitionTimingFunction = "linear";

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
    assert(elem != null, "elem not null");
    assert("dataset" in elem, "elem is element with dataset property");

    delete elem.dataset.offsetx;
    delete elem.dataset.offsety;
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

    assert(seat_preview_ref != null, "preview not null");

    const [gridX, gridY] = elem_grid_pos_get(seat_preview_ref);

    seat_loc_set(element, gridX, gridY);

    element.style.zIndex = 0;

    container_ref.appendChild(element);

    seat_preview_ref.style.display = "none";
}

function container_handle_drop_selection(event) {
    event.preventDefault();

    assert(containerDomRect != null, "containerDomRect not null");

    const [offsetX, offsetY] = elem_drag_offset_get(selection_ref);

    const gridCellPx = grid_cell_px_get();

    const gridX = clamp(
        Math.round(
            (event.clientX -
                containerDomRect.left -
                offsetX +
                container_ref.scrollLeft) /
                gridCellPx,
        ),
        0,
        gridW_initial,
    );
    const gridY = clamp(
        Math.round(
            (event.clientY -
                containerDomRect.top -
                offsetY +
                container_ref.scrollTop) /
                gridCellPx,
        ),
        0,
        gridH_initial,
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
        const [seatX, seatY] = elem_grid_pos_get(seat);
        seat_abs_loc_set(seat, gridX + seatX, gridY + seatY);
    }

    console.log("ON DROP SELECTION");
}

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

function student_seat_get(student_ref) {
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
    sidebar_student_list_ref.appendChild(student_ref);
    assert(
        STUDENT_DATA_SEAT_INDEX in student_ref.dataset,
        "student to be unseated must be in seat",
        student_ref,
    );
    delete student_ref.dataset[STUDENT_DATA_SEAT_INDEX];
}

function student_create(name) {
    const student_ref = document.createElement("div");
    student_ref.className = STUDENT_CLASSLIST_SIDEBAR;
    student_ref.textContent = name;
    student_ref.dataset["student"] = "";

    const student_index = student_refs.length;
    student_refs.push(student_ref);

    student_ref.draggable = true;

    student_ref.ondragstart = function (event) {
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

    student_ref.ondrag = function (event) {
        elem_make_invisible(event.target);
        event.stopPropagation();
    };

    student_ref.ondragover = function (event) {
        event.preventDefault();
    };

    student_ref.ondragend = function (event) {
        const student_ref = event.currentTarget;
        elem_make_visible(student_ref);
    };

    return student_ref;
}

function grid_w_set(gridW) {
    container_ref.style.setProperty(GRID_PROP_W, gridW);
}

function grid_h_set(gridH) {
    container_ref.style.setProperty(GRID_PROP_H, gridH);
}

function grid_dims_set(gridW, gridH) {
    container_ref.style.setProperty(GRID_PROP_W, gridW);
    container_ref.style.setProperty(GRID_PROP_H, gridH);
}

function grid_dims_get() {
    const gridW = Number.parseInt(container_ref.style.getPropertyValue(GRID_PROP_W));
    const gridH = Number.parseInt(container_ref.style.getPropertyValue(GRID_PROP_H));

    assert(Number.isSafeInteger(gridW))
    assert(Number.isSafeInteger(gridH))

    return [gridW, gridH]
}

containerDomRect = container_ref.getBoundingClientRect();

function init() {
    // {{{ container
    {
        container_ref.className = "relative bg-white";
        container_ref.style.setProperty(
            "--grid-cell-px",
            gridCellPx_initial + "px",
        );
        container_ref.style.setProperty(SEAT_PROP_GRID_W, SEAT_GRID_W);
        container_ref.style.setProperty(SEAT_PROP_GRID_H, SEAT_GRID_H);
        container_ref.style.setProperty(GRID_PROP_W, gridW_initial);
        container_ref.style.setProperty(GRID_PROP_H, gridH_initial);
        container_ref.style.width = grid_cell_px_dim(GRID_PROP_W);
        container_ref.style.height = grid_cell_px_dim(GRID_PROP_H);

        container_ref.ondragover = function (event) {
            event.preventDefault();
        };

        container_ref.style.backgroundImage = `
        linear-gradient(to right, #e5e5e5 1px, transparent 1px),
        linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
        `;

        container_ref.style.backgroundSize = `var(--grid-cell-px) var(--grid-cell-px)`;

        container_ref.ondrop = function (event) {
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
    }
    // }}}

    // {{{ seat preview
    {
        seat_preview_ref.id = "seat-preview";
        seat_preview_ref.className =
            "absolute bg-blue-300 border-2 border-indigo-500";
        seat_preview_ref.style.display = "none";
        seat_preview_ref.style.width = grid_cell_px_dim(SEAT_PROP_GRID_W);
        seat_preview_ref.style.height = grid_cell_px_dim(SEAT_PROP_GRID_H);
        container_ref.appendChild(seat_preview_ref);
    }
    // }}}

    // {{{ zoom
    {
        const ZOOM_ID__IN = "zoom-in";
        const ZOOM_ID_OUT = "zoom-out";

        const zoom_btn__in = document.getElementById(ZOOM_ID__IN);
        const zoom_btn_out = document.getElementById(ZOOM_ID_OUT);

        zoom_btn__in.addEventListener("click", function () {
            grid_cell_px_adjust(+ZOOM_BTN_SCALE_FACTOR);
        });
        zoom_btn_out.addEventListener("click", function () {
            grid_cell_px_adjust(-ZOOM_BTN_SCALE_FACTOR);
        });

        // add to parent so that zoom still works if event triggers outside canvas
        // bounds and zoom is not interupted if zoom causes canvas to no longer be
        // under mouse (i.e. canvas shrinks)
        container_ref.parentElement.addEventListener("wheel", function (event) {
            if (!event.ctrlKey) {
                return;
            }

            grid_cell_px_adjust(-event.deltaY / 250);
            // TODO: center zoom on mouse position

            // event.preventDefault();
        });
    }
    // }}}

    // {{{ seat controls
    {
        const add_seat_btn = document.getElementById("add-seat-button");

        add_seat_btn.addEventListener("click", () => {
            console.log("creating new seat");
            container_ref.appendChild(seat_create(0, 0));
        });

        container_ref.addEventListener("click", function (event) {
            if (!event.ctrlKey || is_creating_selection) {
                return;
            }
            event.preventDefault();

            containerDomRect = container_ref.getBoundingClientRect();

            const px_x =
                event.clientX -
                containerDomRect.left +
                container_ref.scrollLeft;
            const px_y =
                event.clientY - containerDomRect.top + container_ref.scrollTop;
            const [center_gridX, center_gridY] = px_point_to_grid_round(
                grid_cell_px_get(),
                px_x,
                px_y,
            );

            const gridX = Math.round(center_gridX - SEAT_GRID_W / 2);
            const gridY = Math.round(center_gridY - SEAT_GRID_H / 2);

            container_ref.appendChild(seat_create(gridX, gridY));
        });
    }
    // }}}

    // {{{ selection
    {
        selection_ref.id = "selection";
        selection_ref.className =
            "absolute bg-blue-300/40 ring-2 ring-blue-500 z-5";
        selection_ref.style.display = "none";
        selection_ref.draggable = true;
        container_ref.appendChild(selection_ref);

        ////////////////////////
        // creating selection //
        ////////////////////////

        container_ref.addEventListener("mousedown", function (event) {
            if (event.ctrlKey) {
                return;
            }
            containerDomRect = container_ref.getBoundingClientRect();
            console.log("mouse down", event.composedPath());
            {
                // ensure not clicking something besides container
                const path = event.composedPath();
                if (path.at(0)?.id !== container_ref.id) {
                    return;
                }
            }

            if (selected_region != null) {
                selection_clear();
            }

            const gridCellPx = grid_cell_px_get();

            const gridX = Math.floor(
                (event.clientX -
                    containerDomRect.left +
                    container_ref.scrollLeft) /
                    gridCellPx,
            );
            const gridY = Math.floor(
                (event.clientY -
                    containerDomRect.top +
                    container_ref.scrollTop) /
                    gridCellPx,
            );
            selected_region = {
                start: { gridX, gridY },
                end: { gridX: gridX + 1, gridY: gridY + 1 },
                anchor: { gridX, gridY },
            };
            selection_update();
            selection_ref.draggable = "false"
            is_creating_selection = true;
        });

        container_ref.addEventListener("mousemove", function (event) {
            if (!is_creating_selection || selected_region == null) {
                // selection_clear();
                return;
            }
            containerDomRect = container_ref.getBoundingClientRect();

            const gridCellPx = grid_cell_px_get();

            const gridX = Math.floor(
                (event.clientX -
                    containerDomRect.left +
                    container_ref.scrollLeft) /
                    gridCellPx,
            );
            const gridY = Math.floor(
                (event.clientY -
                    containerDomRect.top +
                    container_ref.scrollTop) /
                    gridCellPx,
            );
            selected_region_end_set(gridX, gridY);

            selection_update();
        });

        container_ref.addEventListener("mouseup", function (event) {
            containerDomRect = container_ref.getBoundingClientRect();
            if (!is_creating_selection || selected_region == null) {
                selection_clear();
                return;
            }
            console.log("mouse up");

            const gridCellPx = grid_cell_px_get();

            const gridX = Math.floor(
                (event.clientX -
                    containerDomRect.left +
                    container_ref.scrollLeft) /
                    gridCellPx,
            );
            const gridY = Math.floor(
                (event.clientY -
                    containerDomRect.top +
                    container_ref.scrollTop) /
                    gridCellPx,
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
            selection_ref.draggable = "true"
        });

        ////////////////////////
        // dragging selection //
        ////////////////////////

        selection_ref.ondragstart = function (event) {
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
            selection_force_appear_above_seats();
        };

        selection_ref.ondrag = function (event) {
            containerDomRect = container_ref.getBoundingClientRect();
            assert(containerDomRect != null, "containerDomRect not null");
            assert(selected_region != null, "selected_region not null");

            const [offsetX, offsetY] = elem_drag_offset_get(event.target);

            const gridCellPx = grid_cell_px_get();

            const gridX = clamp(
                Math.round(
                    (event.clientX -
                        containerDomRect.left -
                        offsetX +
                        container_ref.scrollLeft) /
                        gridCellPx,
                ),
                0,
                gridW_initial,
            );
            const gridY = clamp(
                Math.round(
                    (event.clientY -
                        containerDomRect.top -
                        offsetY +
                        container_ref.scrollTop) /
                        gridCellPx,
                ),
                0,
                gridH_initial,
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

        selection_ref.ondragend = function (event) {
            if (selected_region == null) {
                console.warn("no selection on ondragend");
            }

            if (event.dataTransfer.dropEffect !== "none") {
                // drop succeeded
                return;
            }
        };
    }
    // }}}

    // {{{ copy and pasting selection
    {
        window.addEventListener("copy", function (event) {
            const window_selection = window.getSelection();
            if (window_selection && window_selection.toString().length > 0) {
                // don't copy selection if user is trying to copy
                // something else
                return;
            }
            if (!selected_region) {
                // don't copy if no selection
                console.warn("no selected region");
                return;
            }

            if (is_creating_selection) {
                console.warn("cannot copy selection while creating");
                return;
            }

            if (!event.clipboardData) {
                console.warn("no clipboardData!");
                return;
            }
            event.preventDefault();

            const selected_offsets = [];

            const selected_seats = selected_seat_refs_get();
            for (const seat_ref of selected_seats) {
                const [gridX, gridY] = elem_grid_pos_get(seat_ref);
                selected_offsets.push({ gridX, gridY });
            }

            const [width, height] = selection_dims_get();

            event.clipboardData.setData(
                SELECTION_CLIPBOARD_DATA_TYPE,
                JSON.stringify({
                    selected_offsets,
                    width,
                    height,
                }),
            );
        });

        window.addEventListener("paste", function (event) {
            if (!event.clipboardData) {
                return;
            }

            const selection_data_str = event.clipboardData.getData(
                SELECTION_CLIPBOARD_DATA_TYPE,
            );

            if (!selection_data_str) {
                return;
            }

            event.preventDefault();

            let selection_data;
            try {
                selection_data = JSON.parse(selection_data_str);
            } catch (e) {
                console.error("failed to parse selection data", e);
                return;
            }

            assert(
                "selected_offsets" in selection_data &&
                    Array.isArray(selection_data.selected_offsets),
            );
            assert(
                "width" in selection_data &&
                    typeof selection_data.width == "number",
            );
            assert(
                "height" in selection_data &&
                    typeof selection_data.height == "number",
            );
            // debugger;

            const startX = Math.round(gridW_initial / 2);
            const startY = Math.round(gridH_initial / 2);
            const endX = startX + selection_data.width;
            const endY = startY + selection_data.height;

            selection_clear();

            selected_region = {
                start: { gridX: startX, gridY: startY },
                end: { gridX: endX, gridY: endY },
            };

            selection_update();
            selection_force_appear_above_seats();

            for (const { gridX, gridY } of selection_data.selected_offsets) {
                const new_seat_ref = seat_create(
                    startX + gridX,
                    startY + gridY,
                );
                seat_make_selected(new_seat_ref, gridX, gridY);
            }

            console.log("paste:", selection_data, event);
        });
    }
    // }}}

    // {{{ grid controls
    {
        /** @type {HTMLInputElement} */
        const grid_rows_input = document.getElementById("rows-input")
        /** @type {HTMLInputElement} */
        const grid_cols_input = document.getElementById("cols-input")

        assert(grid_rows_input != null)
        assert(grid_cols_input != null)

        grid_rows_input.value = gridH_initial
        grid_cols_input.value = gridW_initial

        grid_rows_input.addEventListener("change", function (event) {
            const value = Number.parseInt(event.target.value)
            if (!Number.isSafeInteger(value)) {
                console.error("grid rows not int:", value, event.target.value)
                return;
            }
            if (value < 1) {
                console.error("grid rows < 1:", value, event.target.value)
                return
            }

            grid_h_set(value)
        })

        grid_cols_input.addEventListener("change", function (event) {
            const value = Number.parseInt(event.target.value)
            if (!Number.isSafeInteger(value)) {
                console.error("grid rows not int:", value, event.target.value)
                return;
            }
            if (value < 1) {
                console.error("grid cols < 1:", value, event.target.value)
                return
            }

            grid_w_set(value)
        })
    }
    // }}}

    // {{{ student controls
    {
        const sidebar_student_add = sidebar_ref.querySelector(
            "#add-student-button",
        );
        const sidebar_student_input = sidebar_ref.querySelector(
            "#student-name-input",
        );

        sidebar_student_add.onclick = () => {
            // TODO: make sidebar_student_input a local here (i.e. do document.getElementById) as this is only place it is used
            const name = sidebar_student_input.value;
            if (!name) return;
            sidebar_student_input.value = "";
            sidebar_student_list_ref.appendChild(student_create(name));
            sidebar_student_input.focus();
        };
    }
    // }}}
}

init();
