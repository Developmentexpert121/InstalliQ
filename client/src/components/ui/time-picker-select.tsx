import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TimePickerSelectProps {
  value: string;
  onChange: (value: string) => void;
  minTime?: string;
  maxTime?: string;
  className?: string;
  "data-testid"?: string;
}

function parseHHMM(time: string): [number, number] {
  const parts = (time ?? "").split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
}

function generateSlots(minTime: string, maxTime: string): string[] {
  const [minH, minM] = parseHHMM(minTime);
  const [maxH, maxM] = parseHHMM(maxTime);
  const minTotal = minH * 60 + minM;
  const maxTotal = maxH * 60 + maxM;
  const slots: string[] = [];
  for (let total = minTotal; total <= maxTotal; total += 30) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

function formatLabel(slot: string): string {
  const [h, m] = parseHHMM(slot);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function TimePickerSelect({
  value,
  onChange,
  minTime = "06:00",
  maxTime = "20:00",
  className,
  "data-testid": testId,
}: TimePickerSelectProps) {
  const slots = generateSlots(minTime, maxTime);

  return (
    <Select value={value || minTime} onValueChange={onChange}>
      <SelectTrigger className={className} data-testid={testId}>
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent>
        {slots.map((slot) => (
          <SelectItem key={slot} value={slot}>
            {formatLabel(slot)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
