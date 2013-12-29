define([], function() {

	var C = {
		VERSION: "0.1.0",
		MINIFIED: false // move entirely to grunt?
	};

	// example pie charts
	C.EXAMPLE_PIES = [
		{
			label: "Programming Languages",
			config: {
				pieTitle: "Programming languages",
				titleColour: "#000000",
				data: [
					{ label: "JavaScript", value: 264131, tooltip: "" },
					{ label: "Ruby", value: 218812, tooltip: "" },
					{ label: "Java", value: 157618, tooltip: "" },
					{ label: "PHP", value: 114384, tooltip: "" },
					{ label: "Python", value: 95002, tooltip: "" },
					{ label: "C+", value: 78327, tooltip: "" },
					{ label: "C", value: 67706, tooltip: "" },
					{ label: "Objective-C", value: 36344, tooltip: "" },
					{ label: "C#", value: 32170, tooltip: "" },
					{ label: "Shell", value: 28561, tooltip: "" }
				]
			}
		},
		{
			label: "Canadian Birds",
			config: {
				pieTitle: "Canadian Birds",
				titleColour: "#000000",
				data: [
					{ label: "JavaScript", value: 264131, tooltip: "" }
				]
			}
		}
	];

	return C;
});