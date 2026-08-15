# src/inputs/ — compositional input family (fase 2, not yet implemented)

Distinct from `src/input/` (the InputBar capsule, which stays untouched).
This folder will hold **atomic, layered input components**: every atom usable
alone, composed by props — never by inheritance, never by a type-switch.

## Shape

```
InputText.tsx      ← atomic base: { value, onChange, placeholder?, size?,
                     leading?, trailing?, invalid?, disabled?, ... }
InputNumber.tsx    = InputText + numeric parsing + steppers (trailing slot)
InputToggle.tsx    = standalone boolean atom (also used as a trailing slot)
InputDate.tsx      = composes InputNumber segments (d/m/y) + optional picker
InputPhone.tsx     = InputText + country-prefix leading slot
InputBirthday.tsx  = composes InputDate (no year-future, age hint)
InputState.tsx     = enum picker (composes ActionButton chips or a select)
```

Rules:
- No rigid hierarchy — InputBirthday sits on InputDate, InputDate may sit on
  InputNumber/InputToggle; whatever composition fits, all atoms exported flat
  from the barrel.
- Each atom: inline styles + theme CSS vars (house convention), peer react >=18,
  many small props over few god-props.
- `src/input/CenterField.tsx`'s `FieldType` switch ('text'|'number'|'phone'|…,
  future 'date'/'country'/'color') will DELEGATE to these atoms once they
  exist — the InputBar capsule becomes a consumer, not the implementation.

Modules currently hand-roll `<input type="datetime-local">` etc. (e.g.
`modules/calendar/.../EventEditor.tsx`) — migrating them here is the payoff.
