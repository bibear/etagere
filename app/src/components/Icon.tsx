import Svg, { Circle, Path } from 'react-native-svg';

// Stroke icons of the design (24x24 viewBox, stroke 2, round caps). Never emoji.
const PATHS = {
  library: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  readings: ['M7 3h10v18l-5-4-5 4z'],
  scan: ['M4 8V5h4M16 5h4v3M20 16v3h-4M8 19H4v-3', 'M8 9v6M11 9v6M14 9v6M17 9v6'],
  forYou: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  search: ['M20 20l-4-4'],
  back: ['M15 18l-6-6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12l5 5 9-10'],
  plus: ['M12 5v14M5 12h14'],
  send: ['M5 12h14M13 6l6 6-6 6'],
  torch: ['M13 2L4 14h7l-1 8 9-12h-7z'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 22,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`icon-${name}`}
    >
      {name === 'search' && <Circle cx={11} cy={11} r={7} />}
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
