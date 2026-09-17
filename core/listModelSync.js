// Reconciliation for the two ListModels that mirror keyviz's nested state:
// the overlay's history rows and a group's keycaps. Both are maintained the same
// way, and both have the same two rules:
//
//   * a row that is still in the new snapshot is updated in place. That matters
//     more than it looks: re-creating a row re-creates its delegate, which
//     re-plays the entrance animation and shows up as a flicker. ListModel.set()
//     with identical values emits nothing, so updating in place is free.
//   * a row that left the snapshot is flagged `dying`; its delegate plays the
//     exit variant and removes the row when it is done (see removeByKey).
//
// The model is only required to look like a ListModel (count/get/set/append/
// remove/setProperty), which keeps this testable outside Qt.

// items:   the new snapshot, in display order
// options: {
//   keyField: the role that holds the key on an existing row ("uid", "keyId")
//   keyOf:    (item) => key, for an incoming item
//   valueOf:  (item, index) => the row object to store
//   animate:  false removes stale rows immediately instead of fading them out
// }
function reconcile(model, items, options) {
    const keyField = options.keyField;
    const keyOf = options.keyOf;
    const keys = items.map(keyOf);

    for (let i = model.count - 1; i >= 0; i--) {
        const row = model.get(i);
        if (keys.indexOf(row[keyField]) !== -1) continue;
        if (options.animate === false) model.remove(i);
        else if (!row.dying) model.setProperty(i, "dying", true);
    }

    items.forEach(function(item, index) {
        const key = keyOf(item);
        let found = -1;
        for (let i = 0; i < model.count; i++) {
            if (model.get(i)[keyField] === key) { found = i; break; }
        }
        const value = options.valueOf(item, index);
        if (found < 0) model.append(value);
        else model.set(found, value);
    });
}

// Called by the delegate's exit timer: drop the row once it has faded out.
function removeByKey(model, keyField, key) {
    for (let i = 0; i < model.count; i++) {
        const row = model.get(i);
        if (row[keyField] === key && row.dying) { model.remove(i); return; }
    }
}
