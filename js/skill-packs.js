// Skill packs: sets of skills added to an existing tracker after it was first seeded.
// Each pack runs once per browser (meta.skillPacks records which have run). A skill is only
// added if no skill with the same name (or one of its aliases) exists in any section, so
// existing skills, levels, landmarks and practice logs are never touched.
//
// Skills use the same compact format as seed.json, plus `aliases` for name matching.
// Every piece of software is its own skill, even when two tools do similar jobs.

const QMUL_MATLAB = {
  kind: 'Link',
  title: 'Get MATLAB & Simulink free through Queen Mary',
  url: 'https://www.qmul.ac.uk/its/its-tools-for-staff-and-students/software-directory/free-and-discounted-software/matlab/',
  notes: 'Campus-wide licence: MATLAB, Simulink and add-ons on your own devices, plus MathWorks self-paced online training.',
};

export const SKILL_PACKS = [
  {
    id: '2026-11-skills',
    // Sub-groups renamed in this pack: [section key, old name, new name].
    renameSubgroups: [['design', 'CAD & Simulation', 'CAD design']],
    // Sections the pack needs. Missing ones are created; missing sub-groups are added.
    sections: [
      { key: 'design', name: 'Design', subgroups: ['CAD design', 'Drawing', 'Design process'] },
      { key: 'modelling', name: 'Computational Modelling', subgroups: ['Methods', 'Coding tools', 'Simulation software'] },
      { key: 'ml', name: 'Machine Learning', subgroups: [] },
    ],
    skills: [
      // ---------- Design ----------
      { name: 'Drawing', aliases: ['Drawing practice', 'Daily drawing'], section: 'design', subgroup: 'Drawing', phase: 'ongoing',
        quickLogMinutes: 120, quickLogNote: 'Drawing session', dailyTargetMin: 120, landmarks: [
        'Line control and confident mark-making', 'Basic shapes, proportion and measuring by eye', '1-, 2- and 3-point perspective',
        'Light, shadow and tone to show form', 'Observational drawing from life (objects, people, places)',
        '30-day sketchbook streak', 'Finished portfolio piece'] },

      { name: 'Ansys (simulation)', aliases: ['Ansys', 'Ansys Mechanical', 'Ansys Workbench'], section: 'design', subgroup: 'CAD design', phase: 'unset', landmarks: [
        'Geometry import and clean-up', 'Meshing and mesh quality', 'Static structural FEA with loads and supports',
        'Interpret results and check against hand calculations', 'Modal or thermal analysis', 'CFD basics (Fluent)'] },
      { name: 'Fusion 360', aliases: ['Autodesk Fusion', 'Autodesk Fusion 360', 'Fusion'], section: 'design', subgroup: 'CAD design', phase: 'unset', landmarks: [
        'Parametric sketches and bodies', 'Components and joints', 'Drawings', 'Rendering', 'CAM or 3D-print a part',
        'Simulation or generative design study'] },
      { name: 'SolidWorks', aliases: ['Solid Works', 'SOLIDWORKS'], section: 'design', subgroup: 'CAD design', phase: 'unset', landmarks: [
        'Sketches and features (extrude, revolve, fillet)', 'Part from a dimensioned drawing', 'Assembly with mates',
        '2D drawing to BS 8888', 'Configurations and design tables', 'CSWA certification'] },
      { name: 'Autodesk Inventor', aliases: ['Inventor'], section: 'design', subgroup: 'CAD design', phase: 'unset', landmarks: [
        'Sketches and parts', 'Assemblies with constraints', 'Drawings', 'iParts / iLogic parametrics', 'Stress analysis basics',
        'Autodesk certification (optional)'] },

      // ---------- Computational Modelling ----------
      { name: 'Computational modelling', aliases: ['Computational modeling', 'Engineering modelling'], section: 'modelling', subgroup: 'Methods', phase: 'unset', landmarks: [
        'Turn a physical problem into equations (assumptions, variables, units)',
        'Numerical methods: root finding, interpolation, numerical integration',
        'Solve ODEs numerically (Euler, Runge–Kutta)', 'Model a real system (e.g. spring–mass–damper, heat transfer)',
        'Validate against hand calculations or data, plus a sensitivity analysis',
        'Mesh convergence and error: know when a result can be trusted', 'Written modelling report for my portfolio'] },

      { name: 'Python for engineering modelling', aliases: ['Python for computational modelling', 'Python for engineering modeling', 'Python modelling', 'Python / MATLAB'],
        section: 'modelling', subgroup: 'Coding tools', phase: 'p1',
        resources: [{ kind: 'Link', title: 'SciPy documentation', url: 'https://docs.scipy.org/doc/scipy/', notes: 'Optimisation, integration, ODE solvers, curve fitting.' }],
        landmarks: [
        'NumPy arrays and vectorised maths', 'Clear plots with Matplotlib (labels, units, legends)',
        'Solve equations and linear systems (numpy.linalg, scipy.optimize)', 'Numerical integration and ODEs (scipy.integrate.solve_ivp)',
        'Fit models to data (curve_fit, regression)', 'Model a real engineering system end to end (e.g. beam deflection, heat transfer)',
        'Validated, documented modelling project on GitHub'] },
      { name: 'Jupyter Notebook', aliases: ['Python - Jupyter Notebook', 'Python Jupyter Notebook', 'Jupyter', 'JupyterHub', 'Jupyter notebooks'],
        section: 'modelling', subgroup: 'Coding tools', phase: 'p1',
        resources: [{ kind: 'Link', title: 'Project Jupyter', url: 'https://jupyter.org/', notes: 'Official site and documentation.' }],
        landmarks: [
        'Create, run and restart notebooks; cells and kernels', 'Markdown cells, headings and LaTeX equations', 'Inline plots and tables',
        'Structure a notebook as a clear technical report', 'Parameter sweeps and interactive widgets (ipywidgets)',
        'Version and share notebooks (Git, GitHub, export to HTML/PDF)', 'Polished, reproducible notebook for coursework'] },
      { name: 'MATLAB', aliases: [], section: 'modelling', subgroup: 'Coding tools', phase: 'unset', resources: [QMUL_MATLAB], landmarks: [
        'MATLAB Onramp: variables, vectors and matrices', 'Scripts, functions and live scripts', 'Plotting and visualising results',
        'Solve linear systems and equations', 'ODE solvers (ode45) and numerical integration', 'Import, process and fit data',
        'Model an engineering system and write it up', 'MathWorks certification (optional)'] },

      { name: 'Simulink', aliases: ['MATLAB Simulink'], section: 'modelling', subgroup: 'Simulation software', phase: 'unset', resources: [QMUL_MATLAB], landmarks: [
        'Simulink Onramp: blocks, signals and scopes', 'Model a first-order system (e.g. RC circuit, tank level)',
        'Transfer function and state-space blocks', 'Mass–spring–damper with a PID control loop',
        'Subsystems, parameters from MATLAB and parameter sweeps', 'Simscape or Stateflow basics', 'Full system model with a written report'] },
      { name: 'Abaqus', aliases: ['Abaqus Learning Edition', 'SIMULIA Abaqus'], section: 'modelling', subgroup: 'Simulation software', phase: 'unset',
        resources: [{ kind: 'Link', title: 'Abaqus Learning Edition (free)', url: 'https://www.3ds.com/edu/education/students/solutions/abaqus-le',
          notes: 'Free from Dassault Systèmes (SIMULIA). Windows only, models up to 1,000 nodes. Sign in with a free 3DEXPERIENCE ID.' }],
        landmarks: [
        'Install the Learning Edition and run a tutorial model', 'Parts, materials and sections', 'Assembly, steps, loads and boundary conditions',
        'Meshing and element choice', 'Static stress analysis checked against hand calculations',
        'Contact, nonlinear material or Explicit (dynamic) analysis', 'Mesh convergence study and report'] },
      { name: 'Simcenter HyperMesh (Altair)', aliases: ['HyperMesh', 'Altair HyperMesh', 'OptiStruct', 'Altair Student Edition'],
        section: 'modelling', subgroup: 'Simulation software', phase: 'unset',
        resources: [{ kind: 'Link', title: 'Altair / Simcenter Student Edition (free)',
          url: 'https://www.siemens.com/en-gb/company/academic-future-workforce/engineering-student-resources/engineering-student-software/altair-student-edition/',
          notes: 'Free with your uni email: Simcenter HyperMesh with the OptiStruct, Radioss and MotionSolve solvers, Simcenter Inspire and more.' }],
        landmarks: [
        'Install the Student Edition and learn the interface', 'Geometry clean-up and midsurfacing', '2D shell and 3D tetra meshing with quality checks',
        'Loads, constraints and materials for an OptiStruct run', 'Linear static analysis and results in HyperView',
        'Topology optimisation with OptiStruct', 'Full pre-process → solve → report workflow'] },

      // ---------- Machine Learning ----------
      { name: 'Machine learning maths', aliases: ['ML maths', 'Machine learning mathematics', 'Maths for machine learning'], section: 'ml', phase: 'p1', landmarks: [
        'Vectors and matrices', 'Derivatives, partial derivatives, chain rule', 'Probability and statistics', 'Gradient descent by hand',
        'Derive linear regression', 'Advanced ML maths (Phase 2)'] },
      { name: 'Machine learning code', aliases: ['Machine learning coding', 'ML coding', 'ML code'], section: 'ml', phase: 'p1', landmarks: [
        'Linear regression from scratch in NumPy', 'scikit-learn pipeline', 'Train/test split and metrics', 'Classification project',
        'Neural network basics (PyTorch)', 'End-to-end project write-up'] },
      { name: 'Machine learning concepts', aliases: ['ML concepts', 'Machine learning theory'], section: 'ml', phase: 'p1', landmarks: [
        'Supervised, unsupervised and reinforcement learning', 'Training, validation and test data; overfitting and underfitting',
        'Bias–variance trade-off and regularisation', 'Evaluation metrics and cross-validation',
        'Core algorithms: linear and logistic regression, decision trees, k-NN, k-means',
        'Neural networks and backpropagation (intuition)', 'Deep learning architectures: CNNs, RNNs, transformers',
        'Data quality, bias and responsible AI'] },
    ],
  },
];

/** Lower-case, drop "(…)" notes and anything that isn't a letter or digit; modeling → modelling. */
export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/modeling/g, 'modelling')
    .replace(/[^a-z0-9]/g, '');
}
