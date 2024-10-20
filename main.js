import "./style.css";

function assert(val, ...msg) {
    if (val) return;
    console.error("Assertion failed", ...msg);
    throw new Error("Assertion failed" + msg?.map(String).join(" ") ?? "");
}

const app = document.getElementById("app");
assert(app != null, "app not null");

const invisible_drag_preview = document.createElement("span");
invisible_drag_preview.style.display = "none";
app.appendChild(invisible_drag_preview);

const gridCellPx = 24;

let containerDomRect;

const container = document.createElement("div");
container.className = "w-full h-full relative bg-gray-100";
container.ondragover = function (event) {
    event.preventDefault();
};
container.style.backgroundImage = `
                        linear-gradient(to right, #e5e5e5 1px, transparent 1px),
                        linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)
                    `;
container.style.backgroundSize = `${gridCellPx}px ${gridCellPx}px`;

let next_draggable_id = 0;

let draggables = [];

function createDraggable() {
    const id = next_draggable_id++;
    const element = document.createElement("div");
    const elementClassName =
        "w-24 h-24 bg-indigo-400 border-2 border-indigo-500 text-center text-xl font-bold absolute";
    element.className = elementClassName;
    element.id = "drag-" + id;
    element.innerText = id.toString();
    element.draggable = true;
    element.style.transform = "translate3d(0, 0, 0)";
    draggables.push(element);

    element.ondragstart = function (event) {
        event.dataTransfer.setData("text/plain", id);
        const rect = event.target.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        event.target.dataset.offsetx = offsetX;
        event.target.dataset.offsety = offsetY;
        const original_translation =
            event.target.style.transform ?? "translate(0px, 0px)";
        console.log({ original_translation });
        event.target.dataset.originaltranslation = original_translation;
        event.dataTransfer.setDragImage(invisible_drag_preview, 0, 0);

        {
            // create drag preview
            const preview = document.createElement("div");
            preview.className =
                "w-24 h-24 bg-blue-300 border-2 border-blue-500 text-center text-xl font-bold absolute";
            preview.id = "drag-preview";
            container.appendChild(preview);
        }

        element.style.zIndex = 999;
    };

    element.ondrag = function (event) {
        assert(containerDomRect != null, "containerDomRect not null");

        const offsetX = Number.parseInt(element.dataset.offsetx ?? 0);
        const offsetY = Number.parseInt(element.dataset.offsety ?? 0);
        assert(Number.isSafeInteger(offsetX), "offsetX is integer", offsetX);
        assert(Number.isSafeInteger(offsetY), "offsetY is integer", offsetY);

        const x = event.clientX - containerDomRect.left - offsetX;
        const y = event.clientY - containerDomRect.top - offsetY;

        element.style.transform = `translate(${x}px, ${y}px)`;

        {
            const clampedX = clamp(
                Math.floor(x / gridCellPx) * gridCellPx,
                0,
                window.innerWidth - gridCellPx,
            );
            const clampedY = clamp(
                Math.floor(y / gridCellPx) * gridCellPx,
                0,
                window.innerHeight - gridCellPx,
            );

            const preview = document.getElementById("drag-preview");
            assert(preview != null, "preview not null");
            preview.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
        }
    };

    element.ondragend = function (event) {
        if (event.dataTransfer.dropEffect === "none") {
            // drop failed

            // note following can be extracted to it's own function
            // apply_onetime_transition(el, transition)
            element.style.transition = "transform 0.3s ease-out";
            element.ontransitionend = () => {
                element.style.transition = "";
            };
            const original_translation =
                event.target.dataset.originaltranslation;
            assert(
                original_translation != null,
                "original_translation not null",
            );
            element.style.transform = original_translation;
        }
    };

    return element;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(n, max));
}

container.ondrop = function (event) {
    event.preventDefault();
    const idStr = event.dataTransfer.getData("text/plain");
    const id = Number.parseInt(idStr);
    assert(Number.isSafeInteger(id), "id is integer", `'${idStr}'`, id);
    console.log("ON DROP", id);
    assert(containerDomRect != null, "containerDomRect not null");
    console.log("DROP EVENT", event);

    const element = draggables[id];
    assert(element != null, "element not null");

    const elementRect = element.getBoundingClientRect();
    assert(elementRect != null, "elementRect not null");

    const offsetX = Number.parseInt(element.dataset.offsetx ?? 0);
    const offsetY = Number.parseInt(element.dataset.offsety ?? 0);
    assert(Number.isSafeInteger(offsetX), "offsetX is integer", offsetX);
    assert(Number.isSafeInteger(offsetY), "offsetY is integer", offsetY);


    const x = event.clientX - containerDomRect.left - offsetX;
    const y = event.clientY - containerDomRect.top - offsetY;

            const clampedX = clamp(
                Math.floor(x / gridCellPx) * gridCellPx,
                0,
                window.innerWidth - gridCellPx,
            );
            const clampedY = clamp(
                Math.floor(y / gridCellPx) * gridCellPx,
                0,
                window.innerHeight - gridCellPx,
            );

    element.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    element.style.zIndex = 0;

    container.appendChild(element);

    {
        const preview = document.getElementById("drag-preview");
        assert(preview != null, "preview not null");
        preview.remove()
    }

    event.dataTransfer.clearData();
};

app.appendChild(container);
containerDomRect = container.getBoundingClientRect();

for (let i = 0; i < 10; i++) {
    container.appendChild(createDraggable());
}
