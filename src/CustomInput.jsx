import React, { useEffect, useState, useRef } from "react";

const CustomInput = ({ value, onChange, placeholder, disabled }) => {
  const [text, setText] = useState(value);
  const divRef = useRef(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  // ✅ Put cursor at end
  const placeCursorAtEnd = () => {
    const el = divRef.current;
    if (!el) return;

    const range = document.createRange();
    const sel = window.getSelection();

    range.selectNodeContents(el);
    range.collapse(false); // false = end of content

    sel.removeAllRanges();
    sel.addRange(range);
  };

  const handleInput = (e) => {
    const newVal = e.currentTarget.textContent;
    setText(newVal);
    onChange(newVal);

    // Keep cursor at end
    setTimeout(placeCursorAtEnd, 0);
  };

  return (
    <div
      ref={divRef}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={handleInput}
      data-placeholder={placeholder}
      className="keyword-input"
    >
      {text}
    </div>
  );
};

export default CustomInput;
