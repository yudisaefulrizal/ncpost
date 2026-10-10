import React from "react";
import { ARTICLE_VARIABLES, IMAGE_VARIABLES } from "../server/content-contract";
export function LabVariables({
  image,
  onInsert,
}: {
  image: boolean;
  onInsert: (value: string) => void;
}) {
  return (
    <div className="row-gap">
      {Object.entries(image ? IMAGE_VARIABLES : ARTICLE_VARIABLES).map(
        ([key, label]) => (
          <button
            type="button"
            key={key}
            className="btn btn-sec btn-sm"
            title={label}
            onClick={() => onInsert(`{{${key}}}`)}
          >{`{{${key}}}`}</button>
        ),
      )}
    </div>
  );
}
