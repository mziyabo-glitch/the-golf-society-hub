-- Migration: Create event_results table for Order of Merit points tracking
-- This table stores points earned by members in OOM events

-- Create the event_results table
CREATE TABLE IF NOT EXISTS public.event_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Ensure one result per member per event
    UNIQUE(event_id, member_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_results_society_id ON public.event_results(society_id);
CREATE INDEX IF NOT EXISTS idx_event_results_event_id ON public.event_results(event_id);
CREATE INDEX IF NOT EXISTS idx_event_results_member_id ON public.event_results(member_id);

-- Enable RLS
ALTER TABLE public.event_results ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Society members can read results for their society
CREATE POLICY "Society members can read event results"
    ON public.event_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
        )
    );

-- RLS Policy: Captain or Handicapper can insert results
CREATE POLICY "Captain or Handicapper can insert event results"
    ON public.event_results
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) IN ('CAPTAIN', 'HANDICAPPER')
                OR 'CAPTAIN' = ANY(SELECT UPPER(unnest(m.roles)))
                OR 'HANDICAPPER' = ANY(SELECT UPPER(unnest(m.roles)))
            )
        )
    );

-- RLS Policy: Captain or Handicapper can update results
CREATE POLICY "Captain or Handicapper can update event results"
    ON public.event_results
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) IN ('CAPTAIN', 'HANDICAPPER')
                OR 'CAPTAIN' = ANY(SELECT UPPER(unnest(m.roles)))
                OR 'HANDICAPPER' = ANY(SELECT UPPER(unnest(m.roles)))
            )
        )
    );

-- RLS Policy: Captain can delete results
CREATE POLICY "Captain can delete event results"
    ON public.event_results
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.members m
            WHERE m.society_id = event_results.society_id
            AND m.user_id = auth.uid()
            AND (
                UPPER(m.role) = 'CAPTAIN'
                OR 'CAPTAIN' = ANY(SELECT UPPER(unnest(m.roles)))
            )
        )
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_event_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_event_results_updated_at
    BEFORE UPDATE ON public.event_results
    FOR EACH ROW
    EXECUTE FUNCTION update_event_results_updated_at();
