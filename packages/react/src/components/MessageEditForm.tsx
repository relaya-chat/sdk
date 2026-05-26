// Copyright (c) 2026 JAB Ventures, Inc. MIT License.
// See LICENSE file at https://github.com/relaya-chat/sdk
interface MessageEditFormProps {
  editContent: string;
  editError: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function MessageEditForm({
  editContent,
  editError,
  onChange,
  onSave,
  onCancel,
}: MessageEditFormProps) {
  return (
    <div className="message-item__edit-form">
      <textarea
        value={editContent}
        onChange={(e) => onChange(e.target.value)}
        maxLength={2000}
        autoFocus
        className="message-item__edit-textarea"
        rows={3}
      />
      {editError && <div className="message-item__edit-error">{editError}</div>}
      <div className="message-item__edit-actions">
        <button className="btn btn--primary btn--sm" onClick={onSave}>
          Save
        </button>
        <button className="btn btn--secondary btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
