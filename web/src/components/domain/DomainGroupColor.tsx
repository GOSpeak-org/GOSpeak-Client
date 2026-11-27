import clsx from "clsx";
import { GROUP_COLORS } from "@/utils/domainLayout";

interface DomainGroupColorPickerProps {
	value: string;
	onChange: (color: string) => void;
}

export default function DomainGroupColorPicker({
	value,
	onChange,
}: DomainGroupColorPickerProps) {
	return (
		<div
			className="flex flex-wrap items-center gap-1.5"
			role="group"
			aria-label="分组颜色"
		>
			{GROUP_COLORS.map((option) => (
				<button
					key={option.value}
					type="button"
					title={option.label}
					aria-label={option.label}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
					className={clsx(
						"size-4 shrink-0 rounded-full transition-transform",
						option.swatch,
						value === option.value
							? "scale-110 ring-2 ring-primary"
							: "hover:scale-110",
					)}
				/>
			))}
		</div>
	);
}
