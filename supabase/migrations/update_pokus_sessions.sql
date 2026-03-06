-- Rename duration_planned to duration and drop duration_actual
ALTER TABLE pokus_sessions RENAME COLUMN duration_planned TO duration;

-- Drop the old duration_actual column
ALTER TABLE pokus_sessions DROP COLUMN IF EXISTS duration_actual;

-- Add task_id column to pokus_sessions
ALTER TABLE pokus_sessions
ADD COLUMN task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Create index for task_id
CREATE INDEX IF NOT EXISTS idx_pokus_sessions_task_id ON pokus_sessions(task_id);

-- Create index for user_id + created_at (for time stats queries)
CREATE INDEX IF NOT EXISTS idx_pokus_sessions_user_created ON pokus_sessions(user_id, created_at DESC);

-- Grant UPDATE permission for task_id
GRANT UPDATE ON pokus_sessions TO authenticated;
